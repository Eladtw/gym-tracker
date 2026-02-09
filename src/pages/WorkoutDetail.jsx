// src/pages/WorkoutDetail.jsx
import "../css/workout-detail.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import dayjs from "dayjs";
import { supabase } from "../lib/supabaseClient";

/* =======================
   ✅ Strict numeric helpers
======================= */
const toStr = (v) => (v == null ? "" : String(v));
const parseIntStrict = (v) => {
  const s = toStr(v).trim();
  if (s === "") return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  if (!Number.isInteger(n)) return NaN; // you said: integers only
  return n;
};

const isPosInt = (v) => {
  const n = parseIntStrict(v);
  return Number.isFinite(n) && n >= 1;
};

// ✅ weight can be 0 (bodyweight / warmup)
const isNonNegInt = (v) => {
  const n = parseIntStrict(v);
  return Number.isFinite(n) && n >= 0;
};

// ✅ UPDATE THIS to your real Supabase Storage bucket name:
const BUCKET = "exercise-images";

// ---------- Toast system ----------
function Toasts({ toasts, onClose }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.type === "error" ? "toast-error" : "toast-ok"}`}
        >
          <div className="toast-line">
            <strong>
              {t.title ?? (t.type === "error" ? "Action required" : "Done")}
            </strong>
            <button
              className="toast-x"
              aria-label="Dismiss"
              onClick={() => onClose(t.id)}
            >
              ✕
            </button>
          </div>
          <div className="toast-text">{t.text}</div>
        </div>
      ))}
    </div>
  );
}

// נרמול set_targets (JSONB)
function normalizeTargets(t) {
  if (!Array.isArray(t)) return [];
  return [...t]
    .map((s) => ({
      set_index: Number(s?.set_index) || 0,
      reps: s?.reps ?? null,
      weight: s?.weight ?? null,
    }))
    .sort((a, b) => a.set_index - b.set_index);
}

// סיכום סטים לתצוגה קצרה
function summarizeExerciseTargets(setTargets) {
  const arr = normalizeTargets(setTargets);
  if (arr.length === 0) return "";

  const repsArr = arr.map((s) => Number(s.reps) || 0);
  const allRepsSame = repsArr.every((v) => v === repsArr[0]);

  if (allRepsSame) {
    return `${arr.length} sets × ${repsArr[0]} reps`;
  }
  return `${arr.length} sets`;
}

// אם כל המשקלים זהים – מחזיר weight אחד, אחרת null
function getUniformWeight(setTargets) {
  const arr = normalizeTargets(setTargets);
  if (!arr.length) return null;
  const wgtArr = arr.map((s) =>
    s.weight == null ? null : Number(s.weight)
  );
  if (wgtArr.some((x) => x == null || !Number.isFinite(x))) return null;

  const allSame = wgtArr.every((v) => v === wgtArr[0]);
  if (!allSame) return null;
  return wgtArr[0];
}

/* ===== Modal תמונה (זהה ל-SessionPage) ===== */
function ImageModal({ open, title, imageUrl, loading, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="img-modal-overlay" role="dialog" aria-modal="true">
      <div className="img-modal-panel">
        <div className="img-modal-header">
          <div className="img-modal-title" title={title}>
            {title || "Exercise image"}
          </div>
          <button
            type="button"
            className="img-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="img-modal-body">
          {loading && <div className="img-modal-loading">Loading image…</div>}

          {!loading && !imageUrl && (
            <div className="img-modal-empty">
              No image found for this exercise.
            </div>
          )}

          {!loading && imageUrl && (
            <img className="img-modal-img" src={imageUrl} alt={title || ""} />
          )}
        </div>

        <div className="img-modal-footer">
          <button type="button" className="img-modal-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [workout, setWorkout] = useState(null);
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");

  // Toasts
  const [toasts, setToasts] = useState([]);
  const removeToast = (tid) =>
    setToasts((prev) => prev.filter((t) => t.id !== tid));
  const pushToast = (text, opts = {}) => {
    const tid = crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
    const toast = {
      id: tid,
      text,
      type: "error",
      title: "Action required",
      ...opts,
    };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => removeToast(tid), 4000);
  };

  // ✅ Image modal state (כמו SessionPage)
  const [imgOpen, setImgOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState("");
  const [imgTitle, setImgTitle] = useState("");
  const [imgLoading, setImgLoading] = useState(false);

  // ✅ Open image (Signed URL if possible, fallback to Public)
  const openExerciseImage = useCallback(async (exerciseId, exerciseName, imagePath) => {
    const path = imagePath || null;

    setImgTitle(exerciseName || "Exercise image");
    setImgUrl("");
    setImgOpen(true);

    if (!path) return;

    if (typeof path === "string" && /^https?:\/\//i.test(path)) {
      setImgUrl(path);
      setImgLoading(false);
      return;
    }

    setImgLoading(true);

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60);

      if (!error && data?.signedUrl) {
        setImgUrl(data.signedUrl);
        setImgLoading(false);
        return;
      }

      const pub = supabase.storage.from(BUCKET).getPublicUrl(path);
      setImgUrl(pub?.data?.publicUrl || "");
    } catch (e) {
      console.error("openExerciseImage error:", e);
      const pub = supabase.storage.from(BUCKET).getPublicUrl(path);
      setImgUrl(pub?.data?.publicUrl || "");
    } finally {
      setImgLoading(false);
    }
  }, []);

  const closeImg = () => {
    setImgOpen(false);
    setImgUrl("");
    setImgTitle("");
    setImgLoading(false);
  };

  // אוטוקומפליט (Public + Yours)
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState(null);

  // ✅ Variations
  const [variations, setVariations] = useState([]);
  const [selectedVariationId, setSelectedVariationId] = useState("");
  const [variationsLoading, setVariationsLoading] = useState(false);

  // יצירת תרגיל חדש לקטלוג פרטי
  const [newName, setNewName] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  // ✅ בחירת תת-קבוצת שריר עיקרית לתרגיל חדש
  const [muscleSubgroups, setMuscleSubgroups] = useState([]);
  const [newPrimarySubgroupId, setNewPrimarySubgroupId] = useState("");

  // תוכנית סטים
  const [setsCount, setSetsCount] = useState("");
  const [setRows, setSetRows] = useState([{ reps: "", weight: "" }]);

  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [editingItemId, setEditingItemId] = useState(null);

  // ---------- Helpers: variations ----------
  async function loadVariations(exerciseId) {
    if (!exerciseId) {
      setVariations([]);
      setSelectedVariationId("");
      return;
    }

    setVariationsLoading(true);
    const { data, error } = await supabase
      .from("exercise_variations")
      .select("id,label,sort_order,is_active")
      .eq("exercise_id", exerciseId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });

    setVariationsLoading(false);

    if (error) {
      console.error("Failed to load variations", error);
      setVariations([]);
      setSelectedVariationId("");
      return;
    }

    const arr = (data || []).map((v) => ({ id: v.id, label: v.label }));
    setVariations(arr);

    if (arr.length > 0) {
      setSelectedVariationId((prev) => {
        if (prev && arr.some((x) => x.id === prev)) return prev;
        return arr[0].id;
      });
    } else {
      setSelectedVariationId("");
    }
  }

  // ---------- Load workout + exercises ----------
  async function loadAll() {
    const [{ data: w, error: wErr }, { data: ex, error: exErr }] =
      await Promise.all([
        supabase.from("workouts").select("id, name").eq("id", id).single(),
        supabase
          .from("workout_exercises")
          .select(
            `
            id,
            exercise_name,
            exercise_id,
            variation_id,
            set_targets,
            order_index,
            exercises_catalog (
              id,
              name,
              image_path,
              primary_subgroup_id,
              primary_subgroup:muscle_subgroups!exercises_catalog_primary_subgroup_id_fkey (
                id,
                label,
                muscle_groups ( id, label )
              )
            )
          `
          )
          .eq("workout_id", id)
          .order("order_index"),
      ]);

    if (wErr) setMsg("❌ " + wErr.message);
    setWorkout(w || null);

    if (exErr) {
      setMsg("❌ " + exErr.message);
      setItems([]);
      return;
    }

    const rawItems = ex || [];

    // enrich variation labels
    const varIds = Array.from(new Set(rawItems.map((it) => it.variation_id).filter(Boolean)));
    let varMap = new Map();
    if (varIds.length > 0) {
      const { data: vData, error: vErr } = await supabase
        .from("exercise_variations")
        .select("id,label")
        .in("id", varIds);

      if (!vErr) (vData || []).forEach((v) => varMap.set(v.id, v.label));
    }

    // ensure we have image_path fallback
    const ids = Array.from(new Set(rawItems.map((it) => it.exercise_id).filter(Boolean)));
    let metaMap = new Map();
    if (ids.length > 0) {
      const { data: exRows, error: metaErr } = await supabase
        .from("exercises_catalog")
        .select("id, image_path, primary_subgroup_id")
        .in("id", ids);

      if (metaErr) {
        console.error("exercises_catalog meta error:", metaErr);
      } else {
        (exRows || []).forEach((r) =>
          metaMap.set(r.id, { image_path: r.image_path || null })
        );
      }
    }

    const enriched = rawItems.map((it) => {
      const joinedImage = it.exercises_catalog?.image_path ?? null;
      const fallbackImage = it.exercise_id
        ? metaMap.get(it.exercise_id)?.image_path ?? null
        : null;

      return {
        ...it,
        variation_label: it.variation_id ? varMap.get(it.variation_id) || null : null,
        image_path: joinedImage || fallbackImage || null,
      };
    });

    setItems(enriched);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load muscle subgroups
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("muscle_subgroups").select(`
        id, label,
        muscle_groups ( id, label )
      `);

      if (error) {
        console.error("Failed to load muscle_subgroups", error);
        return;
      }

      const arr = (data || [])
        .map((x) => ({
          id: x.id,
          label: x.label,
          muscle_groups: x.muscle_groups || null,
        }))
        .sort((a, b) => {
          const ga = (a.muscle_groups?.label || "").toLowerCase();
          const gb = (b.muscle_groups?.label || "").toLowerCase();
          if (ga !== gb) return ga.localeCompare(gb);
          return (a.label || "").toLowerCase().localeCompare((b.label || "").toLowerCase());
        });

      setMuscleSubgroups(arr);
    })();
  }, []);

  const subgroupsByGroup = useMemo(() => {
    const map = new Map();
    for (const sg of muscleSubgroups) {
      const gLabel = sg?.muscle_groups?.label || "Other";
      if (!map.has(gLabel)) map.set(gLabel, []);
      map.get(gLabel).push(sg);
    }
    return Array.from(map.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [muscleSubgroups]);

  // Summary
  const exercisesCount = items.length;
  const totalSets = items.reduce((acc, it) => acc + normalizeTargets(it.set_targets).length, 0);

  // Autocomplete
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = query.trim();
      if (q.length < 2) {
        setSuggestions([]);
        return;
      }

      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id ?? null;

      let qb = supabase
        .from("exercises_catalog")
        .select(
          `
          id, name, owner_id, image_path, primary_subgroup_id,
          primary_subgroup:muscle_subgroups!exercises_catalog_primary_subgroup_id_fkey (
            id, label, muscle_groups ( id, label )
          )
        `
        )
        .ilike("name", `%${q}%`)
        .limit(20);

      qb = uid ? qb.or(`owner_id.is.null,owner_id.eq.${uid}`) : qb.is("owner_id", null);

      const { data, error } = await qb;
      if (error) {
        setSuggestions([]);
        setMsg("❌ " + error.message);
        return;
      }
      setSuggestions(data || []);
    }, 200);

    return () => clearTimeout(t);
  }, [query]);

  // when exercise changes, load variations
  useEffect(() => {
    if (!selectedExercise?.id) {
      setVariations([]);
      setSelectedVariationId("");
      return;
    }
    loadVariations(selectedExercise.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExercise?.id]);

  function pickSuggestion(ex) {
    setSelectedExercise(ex);
    setQuery(ex.name);
    setSuggestions([]);
  }

  function resetForms() {
    setSelectedExercise(null);
    setQuery("");
    setSuggestions([]);
    setVariations([]);
    setSelectedVariationId("");
    setNewName("");
    setYoutubeUrl("");
    setNewPrimarySubgroupId("");
    setSetsCount("");
    setSetRows([{ reps: "", weight: "" }]);
    setEditingItemId(null);
  }

  /* =======================
     ✅ Plan validation (shared for Add + Edit)
  ======================= */
  const canBuildPlan = Number.isInteger(Number(setsCount)) && Number(setsCount) > 0;

  const planValidation = useMemo(() => {
    const missing = [];

    if (!canBuildPlan) {
      return { ok: false, missing: ["Number of sets (positive integer)"] };
    }

    const expected = Number(setsCount);
    if (setRows.length !== expected) {
      return { ok: false, missing: [`Mismatch: sets=${expected}, rows=${setRows.length}`] };
    }

    for (let i = 0; i < setRows.length; i++) {
      const r = setRows[i];
      if (!isPosInt(r.reps)) missing.push(`Set ${i + 1}: reps`);
      if (!isNonNegInt(r.weight)) missing.push(`Set ${i + 1}: weight`);
    }

    return { ok: missing.length === 0, missing };
  }, [canBuildPlan, setsCount, setRows]);

  const allRowsValid = planValidation.ok;

  const hasVariations = variations.length > 0;
  const variationValue = selectedVariationId || null;

  const alreadyInWorkout = selectedExercise?.id
    ? items.some(
        (it) =>
          it.exercise_id === selectedExercise.id &&
          (it.variation_id ?? null) === variationValue
      )
    : false;

  const canAttach =
    !!selectedExercise?.id &&
    allRowsValid &&
    !alreadyInWorkout &&
    (!hasVariations || !!selectedVariationId);

  const canCreateAndAttach =
    newName.trim().length > 0 && !!newPrimarySubgroupId && allRowsValid;

  const canSaveEdit = allRowsValid;

  // Plan helpers
  function onSetsCountChange(v) {
    setSetsCount(v);
    const n = Math.max(0, Number(v) || 0);
    if (n <= 0) {
      setSetRows([{ reps: "", weight: "" }]);
      return;
    }
    setSetRows((prev) => {
      const copy = prev.slice(0, n);
      while (copy.length < n) copy.push({ reps: "", weight: "" });
      return copy;
    });
  }

  function updateRow(idx, field, value) {
    setSetRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  function toSetTargetsPayload() {
    const n = Number(setsCount) || 0;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const r = setRows[i] || { reps: "", weight: "" };
      arr.push({
        set_index: i + 1,
        reps: Number(toStr(r.reps).trim()),
        weight: Number(toStr(r.weight).trim()),
      });
    }
    return arr;
  }

  // Modal open helpers
  function openAddModal() {
    resetForms();
    setModalMode("add");
    setIsModalOpen(true);
  }

  function openEditModal(item) {
    resetForms();
    setModalMode("edit");
    setEditingItemId(item.id);

    const st = normalizeTargets(item.set_targets);

    setQuery(item.exercise_name || "");
    if (item.exercise_id) {
      setSelectedExercise({ id: item.exercise_id, name: item.exercise_name, owner_id: null });
    }

    setSelectedVariationId(item.variation_id || "");

    setSetsCount(st.length ? String(st.length) : "");
    setSetRows(
      st.length
        ? st.map((s) => ({
            reps: s.reps != null ? String(s.reps) : "",
            weight: s.weight != null ? String(s.weight) : "",
          }))
        : [{ reps: "", weight: "" }]
    );

    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  // Actions
  async function addExerciseFromCatalog() {
    setMsg("");

    const missing = [];
    if (!selectedExercise?.id) missing.push("Select an exercise from the list");
    if (hasVariations && !selectedVariationId) missing.push("Choose a variation");
    if (alreadyInWorkout) missing.push("This exercise + variation is already in this workout");
    if (!planValidation.ok) missing.push(...planValidation.missing);

    if (missing.length) {
      pushToast("Please complete:\n• " + missing.join("\n• "));
      return;
    }

    setAdding(true);

    const payload = {
      workout_id: id,
      exercise_id: selectedExercise.id,
      exercise_name: selectedExercise.name,
      variation_id: selectedVariationId || null,
      set_targets: toSetTargetsPayload(),
      order_index: items.length || 0,
    };

    const { error } = await supabase.from("workout_exercises").insert(payload);
    setAdding(false);

    if (error) {
      pushToast(error.message);
      return;
    }

    resetForms();
    setMsg("✅ Exercise added");
    setIsModalOpen(false);
    loadAll();
  }

  async function addNewExerciseToCatalogAndAttach() {
    setMsg("");

    const missing = [];
    if (!newName.trim()) missing.push("Exercise name");
    if (!newPrimarySubgroupId) missing.push("Primary muscle subgroup");
    if (!planValidation.ok) missing.push(...planValidation.missing);

    if (missing.length) {
      pushToast("Please complete:\n• " + missing.join("\n• "));
      return;
    }

    setCreating(true);

    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) {
      setCreating(false);
      pushToast("Not logged in");
      return;
    }

    const desired = newName.trim();

    const { data: existed, error: eDup } = await supabase
      .from("exercises_catalog")
      .select("id, name")
      .eq("owner_id", uid)
      .ilike("name", desired)
      .limit(5);

    if (eDup) {
      setCreating(false);
      pushToast(eDup.message);
      return;
    }

    if (
      (existed || []).some(
        (x) => (x.name || "").trim().toLowerCase() === desired.toLowerCase()
      )
    ) {
      setCreating(false);
      pushToast("Exercise with the same name already exists in your catalog");
      return;
    }

    const { data: ex, error: e1 } = await supabase
      .from("exercises_catalog")
      .insert({
        owner_id: uid,
        name: desired,
        youtube_url: youtubeUrl || null,
        primary_subgroup_id: newPrimarySubgroupId,
      })
      .select("id, name")
      .single();

    if (e1) {
      setCreating(false);
      pushToast(e1.code === "23505" ? "Exercise already exists. Pick it from the list." : e1.message);
      return;
    }

    const { error: eTarget } = await supabase
      .from("exercise_muscle_targets")
      .insert({
        exercise_id: ex.id,
        subgroup_id: newPrimarySubgroupId,
        role: "primary",
      });

    if (eTarget) {
      try {
        await supabase.from("exercises_catalog").delete().eq("id", ex.id);
      } catch {
        // ignore
      }
      setCreating(false);
      pushToast("Failed to save muscle mapping: " + eTarget.message);
      return;
    }

    const payload = {
      workout_id: id,
      exercise_id: ex.id,
      exercise_name: ex.name,
      variation_id: null,
      set_targets: toSetTargetsPayload(),
      order_index: items.length || 0,
    };

    const { error: e2 } = await supabase.from("workout_exercises").insert(payload);
    setCreating(false);

    if (e2) {
      pushToast(e2.message);
      return;
    }

    resetForms();
    setMsg("✅ Exercise created & added");
    setIsModalOpen(false);
    loadAll();
  }

  async function saveExistingExercise() {
    if (!editingItemId) return;
    setMsg("");

    if (!canSaveEdit) {
      pushToast("Please complete:\n• " + planValidation.missing.join("\n• "));
      return;
    }

    if (selectedExercise?.id) {
      const hasVarsNow = variations.length > 0;
      if (hasVarsNow && !selectedVariationId) {
        pushToast("Please choose a variation");
        return;
      }
    }

    const payload = {
      set_targets: toSetTargetsPayload(),
      variation_id: selectedVariationId || null,
    };

    const { error } = await supabase
      .from("workout_exercises")
      .update(payload)
      .eq("id", editingItemId);

    if (error) {
      pushToast(error.message);
      return;
    }

    resetForms();
    setMsg("✅ Exercise updated");
    setIsModalOpen(false);
    loadAll();
  }

  async function removeExercise(rowId) {
    setMsg("");
    const { error } = await supabase.from("workout_exercises").delete().eq("id", rowId);
    if (error) {
      pushToast(error.message);
      return;
    }
    setMsg("✅ Exercise removed");
    loadAll();
  }

  async function startSession() {
    setMsg("");
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) {
      pushToast("Not logged in");
      return;
    }
    const today = dayjs().format("YYYY-MM-DD");

    const { data, error } = await supabase
      .from("sessions")
      .insert({ user_id: uid, workout_id: id, session_date: today })
      .select("id")
      .single();

    if (error) {
      pushToast(error.message);
      return;
    }
    navigate(`/session/${data.id}`);
  }

  if (!workout) return <p className="wd-loading">Loading…</p>;

  function renderSetsDetailed(st) {
    const arr = normalizeTargets(st);
    if (!arr.length) return null;
    return (
      <div className="wd-ex-sets">
        {arr.map((r) => (
          <div key={r.set_index} className="wd-ex-set-row">
            <span className="wd-ex-set-label">Set {r.set_index}</span>
            <span className="wd-ex-set-desc">
              {r.reps ?? "?"} reps × {r.weight ?? "?"} kg
            </span>
          </div>
        ))}
      </div>
    );
  }

  const variationLabelForCard = (it) => {
    if (!it.exercise_id) return null;
    if (it.variation_id && it.variation_label) return it.variation_label;
    if (it.variation_id && !it.variation_label) return "Selected";
    return "None";
  };

  return (
    <div className="wd-page">
      <Toasts toasts={toasts} onClose={removeToast} />

      {/* top bar */}
      <header className="wd-header">
        <button className="wd-back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </header>

      {/* title + summary */}
      <section className="wd-title-block">
        <h1 className="wd-title">{workout.name}</h1>
        <div className="wd-subtitle">
          {exercisesCount} {exercisesCount === 1 ? "exercise" : "exercises"} ·{" "}
          {totalSets} total sets
        </div>

        <button className="wd-start-session-btn" onClick={startSession}>
          Start Session
        </button>

        {msg && <p className="wd-message">{msg}</p>}
      </section>

      {/* add exercise card */}
      <section className="wd-add-section">
        <button className="wd-add-card" onClick={openAddModal}>
          + Add Exercise
        </button>
      </section>

      {/* exercise cards */}
      <section className="wd-ex-list">
        {items.length === 0 && <p className="wd-empty">No exercises yet for this workout.</p>}

        {items.map((it, index) => {
          const summary = summarizeExerciseTargets(it.set_targets);
          const uniformWeight = getUniformWeight(it.set_targets);

          const catalog = it.exercises_catalog || {};
          const subgroup = catalog.primary_subgroup || null;
          const muscleGroupLabel = subgroup?.muscle_groups?.label || null;
          const primaryMuscleLabel = subgroup?.label || null;

          const vLabel = variationLabelForCard(it);
          const canOpenImg = !!it.image_path;

          return (
            <article key={it.id} className="wd-ex-card">
              <div className="wd-ex-header">
                <div className="wd-ex-left">
                  <div className="wd-ex-handle">⋮⋮</div>
                  <div className="wd-ex-index">{index + 1}</div>

                  <div className="wd-ex-main">
                    <div className="wd-ex-name">{it.exercise_name}</div>

                    <div className="wd-ex-meta-row">
                      {muscleGroupLabel && (
                        <span className="wd-chip wd-chip-group">{muscleGroupLabel}</span>
                      )}

                      {primaryMuscleLabel && (
                        <span className="wd-chip wd-chip-primary-muscle">
                          Primary: {primaryMuscleLabel}
                        </span>
                      )}

                      {it.exercise_id && (
                        <span className="wd-chip wd-chip-variation">Var: {vLabel}</span>
                      )}

                      {summary && <span className="wd-ex-summary">{summary}</span>}
                    </div>

                    {uniformWeight != null && (
                      <div className="wd-ex-weightline">@ {uniformWeight} kg</div>
                    )}
                  </div>
                </div>

                <div className="wd-ex-actions">
                  <button
                    type="button"
                    className="wd-img-icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      openExerciseImage(it.exercise_id, it.exercise_name, it.image_path);
                    }}
                    disabled={!canOpenImg}
                    title={canOpenImg ? "View exercise image" : "No image"}
                    aria-label="View image"
                  >
                    🖼
                  </button>

                  {it.exercise_id && (
                    <Link to={`/progress/id/${it.exercise_id}`} className="wd-ex-progress-link">
                      Progress
                    </Link>
                  )}

                  <button className="wd-icon-btn" title="Edit exercise" onClick={() => openEditModal(it)}>
                    ✏
                  </button>

                  <button
                    className="wd-icon-btn wd-icon-danger"
                    title="Delete from workout"
                    onClick={() => removeExercise(it.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>

              {renderSetsDetailed(it.set_targets)}
            </article>
          );
        })}
      </section>

      {/* Modal: Add / Edit exercise */}
      {isModalOpen && (
        <div className="wd-modal-overlay" role="dialog" aria-modal="true">
          <div className="wd-modal">
            <div className="wd-modal-header">
              <h2 className="wd-modal-title">
                {modalMode === "add" ? "Add Exercise" : "Edit Exercise"}
              </h2>
              <button className="wd-modal-close" onClick={closeModal} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="wd-modal-body">
              {/* ADD: search */}
              {modalMode === "add" ? (
                <>
                  <label className="wd-field-label">
                    Search catalog… (2+ chars) — Public + Yours
                    <input
                      className="wd-input"
                      placeholder="e.g., Bench Press"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setSelectedExercise(null);
                        setVariations([]);
                        setSelectedVariationId("");
                      }}
                    />
                  </label>

                  {suggestions.length > 0 && (
                    <div className="wd-suggestions">
                      {suggestions.map((ex) => {
                        const sg = ex.primary_subgroup || null;
                        const mgLabel = sg?.muscle_groups?.label || null;
                        const primaryLabel = sg?.label || null;

                        return (
                          <div
                            key={ex.id}
                            className="wd-suggestion-item"
                            onClick={() => pickSuggestion(ex)}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter") pickSuggestion(ex);
                            }}
                            tabIndex={0}
                          >
                            <span>
                              {ex.name}
                              {mgLabel && <span className="wd-suggestion-mg"> · {mgLabel}</span>}
                              {primaryLabel && (
                                <span className="wd-suggestion-primary"> ({primaryLabel})</span>
                              )}
                            </span>
                            <span className="wd-suggestion-owner">
                              {ex.owner_id ? "yours" : "public"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* EDIT: locked exercise */}
                  <div className="wd-locked-ex">
                    <div className="wd-locked-label">Exercise</div>
                    <div className="wd-locked-value">{query}</div>
                  </div>
                </>
              )}

              {/* Variations selector */}
              {selectedExercise?.id && (
                <div className="wd-variation-box">
                  <div className="wd-variation-head">
                    <div className="wd-variation-title">Variation</div>
                    {variationsLoading && <span className="wd-mini-muted">Loading…</span>}
                  </div>

                  {variations.length > 0 ? (
                    <select
                      className="wd-input"
                      value={selectedVariationId}
                      onChange={(e) => setSelectedVariationId(e.target.value)}
                    >
                      {variations.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="wd-no-variations">No variations</div>
                  )}

                  {alreadyInWorkout && modalMode === "add" && (
                    <div className="wd-inline-warn">
                      This exercise + variation is already in this workout.
                    </div>
                  )}
                </div>
              )}

              {/* sets plan */}
              <div className="wd-sets-section">
                <label className="wd-field-label">
                  Number of sets
                  <input
                    className="wd-input"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder="e.g., 3"
                    value={setsCount}
                    onChange={(e) => onSetsCountChange(e.target.value)}
                  />
                </label>

                {canBuildPlan && (
                  <div className="wd-sets-grid">
                    {setRows.map((row, idx) => (
                      <div key={idx} className="wd-sets-row">
                        <div className="wd-sets-row-label">Set {idx + 1}</div>
                        <div className="wd-sets-row-inputs">
                          <input
                            className="wd-input"
                            type="number"
                            min={1}
                            inputMode="numeric"
                            placeholder="Reps"
                            value={row.reps}
                            onChange={(e) => updateRow(idx, "reps", e.target.value)}
                          />
                          <input
                            className="wd-input"
                            type="number"
                            min={0} // ✅ FIX
                            inputMode="numeric"
                            placeholder="Weight (kg)"
                            value={row.weight}
                            onChange={(e) => updateRow(idx, "weight", e.target.value)}
                          />
                        </div>
                      </div>
                    ))}

                    {!allRowsValid && (
                      <p className="wd-error-text">
                        {planValidation.missing.join(" • ")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Create New Exercise – only add mode */}
              {modalMode === "add" && (
                <div className="wd-new-ex-section">
                  <h3 className="wd-new-ex-title">Create New Exercise</h3>

                  <label className="wd-field-label">
                    New exercise name (for your private catalog)
                    <input
                      className="wd-input"
                      placeholder="e.g., Barbell Hip Thrust"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </label>

                  <label className="wd-field-label">
                    Primary muscle (required)
                    <select
                      className="wd-input"
                      value={newPrimarySubgroupId}
                      onChange={(e) => setNewPrimarySubgroupId(e.target.value)}
                    >
                      <option value="">Choose a primary muscle…</option>
                      {subgroupsByGroup.map(([groupLabel, subs]) => (
                        <optgroup key={groupLabel} label={groupLabel}>
                          {subs.map((sg) => (
                            <option key={sg.id} value={sg.id}>
                              {sg.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>

                  <label className="wd-field-label">
                    YouTube URL (optional)
                    <input
                      className="wd-input"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                    />
                  </label>

                  <p className="wd-help-text">
                    Public results are read-only; new entries are saved to your private catalog.
                  </p>
                </div>
              )}
            </div>

            <div className="wd-modal-footer">
              {modalMode === "add" ? (
                <>
                  <button
                    className="wd-btn-primary"
                    onClick={addExerciseFromCatalog}
                    disabled={adding || !canAttach}
                    title="Attach selected exercise from catalog"
                  >
                    {adding ? "Adding…" : "Add from catalog"}
                  </button>

                  <span className="wd-or-text">or</span>

                  <button
                    className="wd-btn-secondary"
                    onClick={addNewExerciseToCatalogAndAttach}
                    disabled={creating || !canCreateAndAttach}
                    title="Create new private exercise & attach"
                  >
                    {creating ? "Creating…" : "Create in catalog + add"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="wd-btn-primary"
                    onClick={saveExistingExercise}
                    disabled={!canSaveEdit}
                  >
                    Save changes
                  </button>
                  <button className="wd-btn-ghost" onClick={closeModal}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      <ImageModal
        open={imgOpen}
        title={imgTitle}
        imageUrl={imgUrl}
        loading={imgLoading}
        onClose={closeImg}
      />
    </div>
  );
}
