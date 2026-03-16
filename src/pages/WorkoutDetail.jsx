// src/pages/WorkoutDetail.jsx
import "../css/workout-detail.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { startOrResumeWorkoutSession } from "../lib/sessionFlow";
import { useModal } from "../components/ModalProvider";

/* =======================
   Strict numeric helpers
======================= */
const toStr = (v) => (v == null ? "" : String(v));
const parseIntStrict = (v) => {
  const s = toStr(v).trim();
  if (s === "") return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  if (!Number.isInteger(n)) return NaN;
  return n;
};
const isPosInt = (v) => {
  const n = parseIntStrict(v);
  return Number.isFinite(n) && n >= 1;
};

const BUCKET = "exercise-images";

/* ---------- Toast system ---------- */
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

function summarizeExerciseTargets(setTargets) {
  const arr = normalizeTargets(setTargets);
  if (arr.length === 0) return "";
  const repsArr = arr.map((s) => (s.reps == null ? null : Number(s.reps)));
  const allRepsSame =
    repsArr.every((v) => v != null && Number.isFinite(v)) &&
    repsArr.every((v) => v === repsArr[0]);

  if (allRepsSame) return `${arr.length} sets × ${repsArr[0]} reps`;
  return `${arr.length} sets`;
}

function getUniformWeight(setTargets) {
  const arr = normalizeTargets(setTargets);
  if (!arr.length) return null;
  const wgtArr = arr.map((s) => (s.weight == null ? null : Number(s.weight)));
  if (wgtArr.some((x) => x == null || !Number.isFinite(x))) return null;
  const allSame = wgtArr.every((v) => v === wgtArr[0]);
  if (!allSame) return null;
  return wgtArr[0];
}

/* ===== Facet dropdown (with search) ===== */
function FacetDropdown({
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = options.find((o) => o.value === value) || null;
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) =>
      (o.label || "").toLowerCase().includes(term)
    );
  }, [options, q]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  return (
    <div className={`wd-facet ${disabled ? "is-disabled" : ""}`}>
      <div className="wd-facet-label">{label}</div>

      <button
        type="button"
        className="wd-facet-btn"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
      >
        <span className={`wd-facet-btn-text ${!selected ? "is-muted" : ""}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="wd-facet-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && !disabled && (
        <div className="wd-facet-pop">
          <input
            className="wd-facet-search"
            placeholder="Search..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />

          <div className="wd-facet-list">
            <button
              type="button"
              className={`wd-facet-item ${value == null ? "is-active" : ""}`}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </button>

            {filtered.length === 0 ? (
              <div className="wd-facet-empty">No options</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`wd-facet-item ${
                    o.value === value ? "is-active" : ""
                  }`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== image url helper (public URL like ExerciseLibrary) ===== */
function getPublicImageUrl(path) {
  if (!path) return null;
  if (typeof path === "string" && /^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

/* ===== targets from rows (null allowed) ===== */
function buildTargetsFromRows(rows) {
  return rows.map((r, i) => {
    const reps = toStr(r.reps).trim();
    const weight = toStr(r.weight).trim();

    const repsVal = reps === "" ? null : Number(reps);
    const weightVal = weight === "" ? null : Number(weight);

    return {
      set_index: i + 1,
      reps: Number.isFinite(repsVal) ? repsVal : null,
      weight: Number.isFinite(weightVal) ? weightVal : null,
    };
  });
}

/* ===== Skeleton ===== */
function WorkoutDetailSkeleton() {
  return (
    <div className="wd-page">
      <header className="wd-header">
        <div className="wd-back-btn wd-skeleton wd-skeleton-btn" />
      </header>

      <section className="wd-title-block wd-skeleton-fade">
        <div className="wd-skeleton wd-skeleton-title" />
        <div className="wd-skeleton wd-skeleton-subtitle" />
        <div className="wd-skeleton wd-skeleton-start-btn" />
      </section>

      <section className="wd-add-section">
        <div className="wd-add-card wd-skeleton wd-skeleton-add-card" />
      </section>

      <section className="wd-ex-list">
        {[1, 2, 3].map((n) => (
          <article key={n} className="wd-ex-card wd-skeleton-fade">
            <div className="wd-ex-header">
              <div className="wd-ex-left">
                <div className="wd-skeleton wd-skeleton-handle" />
                <div className="wd-skeleton wd-skeleton-index" />

                <div className="wd-ex-main" style={{ flex: 1 }}>
                  <div className="wd-skeleton wd-skeleton-ex-name" />
                  <div className="wd-skeleton-chip-row">
                    <div className="wd-skeleton wd-skeleton-chip" />
                    <div className="wd-skeleton wd-skeleton-chip wd-skeleton-chip--wide" />
                    <div className="wd-skeleton wd-skeleton-chip" />
                  </div>
                  <div className="wd-skeleton wd-skeleton-weightline" />
                </div>
              </div>

              <div className="wd-ex-actions">
                <div className="wd-skeleton wd-skeleton-icon-btn" />
                <div className="wd-skeleton wd-skeleton-progress-btn" />
                <div className="wd-skeleton wd-skeleton-icon-btn" />
              </div>
            </div>

            <div className="wd-ex-sets">
              <div className="wd-skeleton wd-skeleton-set-row" />
              <div className="wd-skeleton wd-skeleton-set-row" />
              <div className="wd-skeleton wd-skeleton-set-row wd-skeleton-set-row--short" />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function ImageViewerModal({ title, imageUrl, onClose }) {
  return (
    <div
      className="el-image-viewer-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="el-image-viewer-close"
        aria-label="Close image viewer"
        onClick={onClose}
      >
        ✕
      </button>

      <div
        className="el-image-viewer-content"
        onClick={(e) => e.stopPropagation()}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title || ""}
            className="el-image-viewer-img"
          />
        ) : (
          <div className="el-image-viewer-fallback">No image</div>
        )}
        <div className="el-image-viewer-caption">{title || "Exercise"}</div>
      </div>
    </div>
  );
}

function AddExerciseModal({
  workoutId,
  existingItems,
  onAdded,
  onClose,
  openImageViewer,
  pushToast,
}) {
  const [addStep, setAddStep] = useState("select"); // select | review
  const [libLoading, setLibLoading] = useState(false);
  const [libAll, setLibAll] = useState([]);

  const [searchQ, setSearchQ] = useState("");
  const [fGroupId, setFGroupId] = useState(null);
  const [fSubgroupId, setFSubgroupId] = useState(null);
  const [fEquipmentId, setFEquipmentId] = useState(null);

  const [cart, setCart] = useState([]);
  const [submitAdding, setSubmitAdding] = useState(false);

  const alreadyInWorkoutMap = useMemo(() => {
    const m = new Map();
    for (const it of existingItems) {
      const key = `${it.exercise_id}::${it.variation_id ?? "null"}`;
      m.set(key, true);
    }
    return m;
  }, [existingItems]);

  const cartIds = useMemo(() => new Set(cart.map((c) => c.exercise.id)), [cart]);

  const addBodyRef = useState(null)[0];

  async function loadLibrary() {
    setLibLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id ?? null;

      let qb = supabase
        .from("exercises_catalog")
        .select(
          `
          id, name, owner_id, image_path,
          equipment_id,
          equipment:equipment ( id, label ),
          primary_subgroup_id,
          primary_subgroup:muscle_subgroups!exercises_catalog_primary_subgroup_id_fkey (
            id, label,
            muscle_groups ( id, label )
          )
        `
        )
        .order("name", { ascending: true })
        .limit(900);

      qb = uid
        ? qb.or(`owner_id.is.null,owner_id.eq.${uid}`)
        : qb.is("owner_id", null);

      const { data, error } = await qb;
      if (error) throw error;

      setLibAll(data || []);
    } catch (e) {
      console.error("loadLibrary error:", e);
      pushToast(
        "Failed to load exercise library: " + String(e?.message || e)
      );
      setLibAll([]);
    } finally {
      setLibLoading(false);
    }
  }

  useEffect(() => {
    loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(list, { searchQ, groupId, subgroupId, equipmentId }) {
    const term = searchQ.trim().toLowerCase();
    return (list || []).filter((ex) => {
      if (term) {
        const name = (ex.name || "").toLowerCase();
        if (!name.includes(term)) return false;
      }
      const sg = ex.primary_subgroup || null;
      const mgId = sg?.muscle_groups?.id || null;
      const sgId = sg?.id || null;
      const eqId = ex.equipment_id || null;

      if (groupId && mgId !== groupId) return false;
      if (subgroupId && sgId !== subgroupId) return false;
      if (equipmentId && eqId !== equipmentId) return false;
      return true;
    });
  }

  const filteredExercises = useMemo(() => {
    return applyFilters(libAll, {
      searchQ,
      groupId: fGroupId,
      subgroupId: fSubgroupId,
      equipmentId: fEquipmentId,
    });
  }, [libAll, searchQ, fGroupId, fSubgroupId, fEquipmentId]);

  const groupOptions = useMemo(() => {
    if (fSubgroupId) {
      const match = libAll.find((x) => x.primary_subgroup?.id === fSubgroupId);
      const gid = match?.primary_subgroup?.muscle_groups?.id || null;
      const glabel = match?.primary_subgroup?.muscle_groups?.label || null;
      return gid && glabel ? [{ value: gid, label: glabel }] : [];
    }
    const base = applyFilters(libAll, {
      searchQ,
      groupId: null,
      subgroupId: null,
      equipmentId: fEquipmentId,
    });
    const map = new Map();
    for (const ex of base) {
      const mg = ex.primary_subgroup?.muscle_groups || null;
      if (mg?.id && mg?.label) map.set(mg.id, mg.label);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [libAll, searchQ, fEquipmentId, fSubgroupId]);

  const subgroupOptions = useMemo(() => {
    const base = applyFilters(libAll, {
      searchQ,
      groupId: fGroupId,
      subgroupId: null,
      equipmentId: fEquipmentId,
    });
    const map = new Map();
    for (const ex of base) {
      const sg = ex.primary_subgroup || null;
      if (sg?.id && sg?.label) map.set(sg.id, sg.label);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [libAll, searchQ, fGroupId, fEquipmentId]);

  const equipmentOptions = useMemo(() => {
    const base = applyFilters(libAll, {
      searchQ,
      groupId: fGroupId,
      subgroupId: fSubgroupId,
      equipmentId: null,
    });
    const map = new Map();
    for (const ex of base) {
      const eq = ex.equipment || null;
      if (eq?.id && eq?.label) map.set(eq.id, eq.label);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [libAll, searchQ, fGroupId, fSubgroupId]);

  useEffect(() => {
    if (
      fGroupId &&
      groupOptions.length > 0 &&
      !groupOptions.some((o) => o.value === fGroupId)
    ) {
      setFGroupId(null);
    }
  }, [groupOptions, fGroupId]);

  useEffect(() => {
    if (
      fSubgroupId &&
      subgroupOptions.length > 0 &&
      !subgroupOptions.some((o) => o.value === fSubgroupId)
    ) {
      setFSubgroupId(null);
    }
  }, [subgroupOptions, fSubgroupId]);

  useEffect(() => {
    if (
      fEquipmentId &&
      equipmentOptions.length > 0 &&
      !equipmentOptions.some((o) => o.value === fEquipmentId)
    ) {
      setFEquipmentId(null);
    }
  }, [equipmentOptions, fEquipmentId]);

  function addToCart(ex) {
    const key = `${ex.id}::null`;
    if (alreadyInWorkoutMap.get(key)) {
      pushToast("This exercise is already in the workout.");
      return;
    }
    if (cartIds.has(ex.id)) return;

    setCart((prev) => [
      ...prev,
      {
        exercise: ex,
        variationId: null,
        variations: { loaded: false, loading: false, items: [] },
        setsCount: "",
        rows: [],
        fillFromFirst: false,
      },
    ]);
  }

  function removeFromCart(exId) {
    setCart((prev) => prev.filter((c) => c.exercise.id !== exId));
  }

  function toggleCart(ex) {
    if (cartIds.has(ex.id)) removeFromCart(ex.id);
    else addToCart(ex);
  }

  async function loadVariationsFor(exerciseId) {
    setCart((prev) =>
      prev.map((c) =>
        c.exercise.id === exerciseId
          ? { ...c, variations: { ...c.variations, loading: true } }
          : c
      )
    );

    try {
      const { data, error } = await supabase
        .from("exercise_variations")
        .select("id,label,sort_order,is_active")
        .eq("exercise_id", exerciseId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });

      if (error) throw error;
      const arr = (data || []).map((v) => ({ id: v.id, label: v.label }));

      setCart((prev) =>
        prev.map((c) =>
          c.exercise.id === exerciseId
            ? { ...c, variations: { loaded: true, loading: false, items: arr } }
            : c
        )
      );
    } catch (e) {
      console.error("loadVariationsFor error:", e);
      setCart((prev) =>
        prev.map((c) =>
          c.exercise.id === exerciseId
            ? { ...c, variations: { loaded: true, loading: false, items: [] } }
            : c
        )
      );
    }
  }

  useEffect(() => {
    if (addStep !== "review") return;
    for (const c of cart) {
      if (!c.variations.loaded && !c.variations.loading) {
        loadVariationsFor(c.exercise.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addStep]);

  function setSetsCount(exId, v) {
    const n = parseIntStrict(v);
    const bounded = Number.isFinite(n) ? Math.max(1, Math.min(10, n)) : NaN;

    setCart((prev) =>
      prev.map((c) => {
        if (c.exercise.id !== exId) return c;

        if (!Number.isFinite(bounded)) {
          return { ...c, setsCount: v, rows: [], fillFromFirst: false };
        }

        let rows = Array.isArray(c.rows) ? [...c.rows] : [];
        rows = rows.slice(0, bounded);
        while (rows.length < bounded) rows.push({ reps: "", weight: "" });

        if (c.fillFromFirst && rows.length > 0) {
          const first = rows[0] || { reps: "", weight: "" };
          rows = rows.map((r, idx) => (idx === 0 ? first : { ...first }));
        }

        return { ...c, setsCount: String(bounded), rows };
      })
    );
  }

  function updateSetRow(exId, idx, field, value) {
    setCart((prev) =>
      prev.map((c) => {
        if (c.exercise.id !== exId) return c;

        const rows = Array.isArray(c.rows) ? [...c.rows] : [];
        if (!rows[idx]) return c;

        rows[idx] = { ...rows[idx], [field]: value };

        if (c.fillFromFirst && idx === 0) {
          const first = rows[0];
          for (let i = 1; i < rows.length; i++) rows[i] = { ...first };
        }

        return { ...c, rows };
      })
    );
  }

  function canEnableFillFromFirst(c) {
    if (!c.rows || c.rows.length === 0) return false;
    const first = c.rows[0] || {};
    const reps = toStr(first.reps).trim();
    const weight = toStr(first.weight).trim();
    return reps !== "" || weight !== "";
  }

  function toggleFillFromFirst(exId) {
    setCart((prev) =>
      prev.map((c) => {
        if (c.exercise.id !== exId) return c;

        const canEnable = canEnableFillFromFirst(c);
        if (!canEnable && !c.fillFromFirst) return c;

        const next = !c.fillFromFirst;
        let rows = Array.isArray(c.rows) ? [...c.rows] : [];
        if (next && rows.length > 0) {
          const first = rows[0] || { reps: "", weight: "" };
          rows = rows.map((r, idx) => (idx === 0 ? first : { ...first }));
        }

        return { ...c, fillFromFirst: next, rows };
      })
    );
  }

  const cartCount = cart.length;
  const canGoNext = cartCount > 0;

  const reviewErrors = useMemo(() => {
    const errors = [];
    for (const c of cart) {
      if (!isPosInt(c.setsCount))
        errors.push(`${c.exercise.name}: sets required (1-10)`);
      const hasVars =
        c.variations.loaded && (c.variations.items?.length || 0) > 0;
      if (hasVars && !c.variationId)
        errors.push(`${c.exercise.name}: choose variation`);
    }
    return errors;
  }, [cart]);

  const canSubmitAdd = reviewErrors.length === 0 && cart.length > 0;

  function apply3SetsToAll() {
    setCart((prev) =>
      prev.map((c) => {
        const rows = [
          { reps: "", weight: "" },
          { reps: "", weight: "" },
          { reps: "", weight: "" },
        ];
        return { ...c, setsCount: "3", rows, fillFromFirst: false };
      })
    );
  }

  async function submitAddToWorkout() {
    if (!canSubmitAdd) {
      pushToast("Please complete:\n• " + reviewErrors.join("\n• "));
      return;
    }

    const payloads = [];
    let orderBase = existingItems.length || 0;

    for (const c of cart) {
      const sets = Number(c.setsCount) || 0;
      let rows = Array.isArray(c.rows) ? [...c.rows] : [];
      if (rows.length !== sets) {
        rows = rows.slice(0, sets);
        while (rows.length < sets) rows.push({ reps: "", weight: "" });
      }

      const targets = buildTargetsFromRows(rows);

      const key = `${c.exercise.id}::${c.variationId ?? "null"}`;
      if (alreadyInWorkoutMap.get(key)) continue;

      payloads.push({
        workout_id: workoutId,
        exercise_id: c.exercise.id,
        exercise_name: c.exercise.name,
        variation_id: c.variationId ?? null,
        set_targets: targets,
        order_index: orderBase++,
      });
    }

    if (payloads.length === 0) {
      pushToast("Nothing to add (maybe duplicates).");
      return;
    }

    setSubmitAdding(true);
    const { error } = await supabase.from("workout_exercises").insert(payloads);
    setSubmitAdding(false);

    if (error) {
      pushToast(error.message);
      return;
    }

    onAdded();
    onClose();
  }

  return (
    <div className="wd-add-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="wd-add-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wd-add-head">
          <div className="wd-add-head-left">
            <div className="wd-add-title">
              {addStep === "select" ? "Add exercises" : "Review & configure"}
            </div>
            <div className="wd-add-desc">
              {addStep === "select"
                ? "Search and filter, then add exercises to your selection."
                : "Sets required (max 10). Variations required only when available. Reps/weight can be empty (Saving data based on your first workout)."}
            </div>
          </div>

          <button
            className="wd-add-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="wd-add-body" ref={addBodyRef}>
          {addStep === "select" ? (
            <>
              <div className="wd-add-searchRow">
                <input
                  className="wd-add-search"
                  placeholder="Search exercises..."
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                />
                <button
                  className="wd-add-clear"
                  type="button"
                  onClick={() => {
                    setSearchQ("");
                    setFGroupId(null);
                    setFSubgroupId(null);
                    setFEquipmentId(null);
                  }}
                >
                  Clear
                </button>
              </div>

              <div className="wd-add-filters">
                <FacetDropdown
                  label="Muscle group"
                  value={fGroupId}
                  options={groupOptions}
                  placeholder="All"
                  onChange={(v) => setFGroupId(v)}
                  disabled={groupOptions.length === 0}
                />
                <FacetDropdown
                  label="Subgroup"
                  value={fSubgroupId}
                  options={subgroupOptions}
                  placeholder="All"
                  onChange={(v) => setFSubgroupId(v)}
                  disabled={subgroupOptions.length === 0}
                />
                <FacetDropdown
                  label="Equipment"
                  value={fEquipmentId}
                  options={equipmentOptions}
                  placeholder="All"
                  onChange={(v) => setFEquipmentId(v)}
                  disabled={equipmentOptions.length === 0}
                />
              </div>

              <div className="wd-add-gridHead">
                <div className="wd-add-gridTitle">
                  {libLoading ? "Loading…" : `${filteredExercises.length} exercises`}
                </div>
                <div className="wd-add-chip">
                  Selected: <strong>{cartCount}</strong>
                </div>
              </div>

              {libLoading ? (
                <div className="wd-add-loading">Loading library…</div>
              ) : filteredExercises.length === 0 ? (
                <div className="wd-add-empty">
                  No exercises match your filters.
                </div>
              ) : (
                <div className="wd-add-grid">
                  {filteredExercises.map((ex) => {
                    const sg = ex.primary_subgroup || null;
                    const mgLabel = sg?.muscle_groups?.label || "";
                    const sgLabel = sg?.label || "";
                    const eqLabel = ex.equipment?.label || "";
                    const selected = cartIds.has(ex.id);

                    const alreadyKey = `${ex.id}::null`;
                    const already = alreadyInWorkoutMap.get(alreadyKey);

                    const thumbUrl = getPublicImageUrl(ex.image_path);

                    return (
                      <div
                        key={ex.id}
                        className={`wd-add-cardEx ${selected ? "is-selected" : ""}`}
                      >
                        <button
                          type="button"
                          className="wd-add-imgBtn"
                          onClick={() => openImageViewer(ex.name, ex.image_path)}
                          title="Open image"
                        >
                          <div className="wd-add-imgWrap">
                            {thumbUrl ? (
                              <img
                                className="wd-add-img"
                                src={thumbUrl}
                                alt={ex.name}
                              />
                            ) : (
                              <div className="wd-add-imgFallback">No image</div>
                            )}
                          </div>
                        </button>

                        <div className="wd-add-exBody">
                          <div className="wd-add-exName">{ex.name}</div>
                          <div className="wd-add-exMeta">
                            {mgLabel && (
                              <span className="wd-add-pill">{mgLabel}</span>
                            )}
                            {sgLabel && (
                              <span className="wd-add-pill">{sgLabel}</span>
                            )}
                            {eqLabel && (
                              <span className="wd-add-pill">{eqLabel}</span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          className={`wd-add-btn ${selected ? "is-remove" : ""}`}
                          onClick={() => toggleCart(ex)}
                          disabled={already}
                          title={
                            already
                              ? "Already in workout"
                              : selected
                              ? "Remove"
                              : "Add"
                          }
                        >
                          {already ? "Added" : selected ? "Remove" : "Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="wd-review-topActions">
                <div className="wd-review-caption">
                  Configure selected exercises (you can keep reps/weight
                  empty).
                </div>
                <button
                  type="button"
                  className="wd-review-quickBtn"
                  onClick={apply3SetsToAll}
                >
                  Apply 3 sets to all
                </button>
              </div>

              <div className="wd-review-list">
                {cart.map((c) => {
                  const ex = c.exercise;
                  const hasVars =
                    c.variations.loaded &&
                    (c.variations.items?.length || 0) > 0;
                  const thumbUrl = getPublicImageUrl(ex.image_path);

                  return (
                    <div
                      key={ex.id}
                      className="wd-review-card el-like-card"
                    >
                      <div className="wd-review-topRow">
                        <button
                          type="button"
                          className="wd-review-thumbBtn"
                          onClick={() => openImageViewer(ex.name, ex.image_path)}
                          title="Open image"
                        >
                          <div className="wd-review-thumbWrap">
                            {thumbUrl ? (
                              <img
                                className="wd-review-thumbImg"
                                src={thumbUrl}
                                alt={ex.name}
                              />
                            ) : (
                              <div className="wd-review-thumbFallback">
                                No image
                              </div>
                            )}
                          </div>
                        </button>

                        <div className="wd-review-titleCol">
                          <div className="wd-review-nameRow">
                            <div className="wd-review-name">{ex.name}</div>
                            <button
                              type="button"
                              className="wd-review-removeInline"
                              onClick={() => removeFromCart(ex.id)}
                            >
                              Remove
                            </button>
                          </div>

                          <div className="wd-review-meta">
                            <span className="wd-review-muted">
                              {ex.primary_subgroup?.muscle_groups?.label || "—"}
                            </span>
                            {" · "}
                            <span className="wd-review-muted">
                              {ex.primary_subgroup?.label || "—"}
                            </span>
                            {ex.equipment?.label ? (
                              <>
                                {" · "}
                                <span className="wd-review-muted">
                                  {ex.equipment.label}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {hasVars && (
                        <div className="wd-review-fieldBlock">
                          <div className="wd-review-fieldLabel">
                            Variation (required)
                          </div>

                          {!c.variations.loaded ? (
                            <button
                              type="button"
                              className="wd-review-loadVarsBtn"
                              onClick={() => loadVariationsFor(ex.id)}
                              disabled={c.variations.loading}
                            >
                              {c.variations.loading
                                ? "Loading…"
                                : "Load variations"}
                            </button>
                          ) : (
                            <select
                              className="wd-review-input"
                              value={c.variationId ?? ""}
                              onChange={(e) =>
                                setCart((prev) =>
                                  prev.map((x) =>
                                    x.exercise.id === ex.id
                                      ? {
                                          ...x,
                                          variationId:
                                            e.target.value || null,
                                        }
                                      : x
                                  )
                                )
                              }
                            >
                              <option value="">Choose…</option>
                              {c.variations.items.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.label}
                                </option>
                              ))}
                            </select>
                          )}

                          {c.variations.loaded && !c.variationId && (
                            <div className="wd-review-warn">
                              Please choose variation
                            </div>
                          )}
                        </div>
                      )}

                      <div className="wd-review-fieldBlock">
                        <div className="wd-review-fieldLabel">
                          Sets (required, max 10)
                        </div>
                        <input
                          className="wd-review-input"
                          type="number"
                          min={1}
                          max={10}
                          inputMode="numeric"
                          placeholder="e.g., 3"
                          value={c.setsCount}
                          onChange={(e) =>
                            setSetsCount(ex.id, e.target.value)
                          }
                        />
                        {!isPosInt(c.setsCount) && (
                          <div className="wd-review-warn">Sets required</div>
                        )}
                      </div>

                      {isPosInt(c.setsCount) && (
                        <div className="wd-setsBox">
                          <div className="wd-setsBoxTop">
                            <label
                              className={`wd-fillAll ${
                                canEnableFillFromFirst(c) ? "" : "is-disabled"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={!!c.fillFromFirst}
                                onChange={() => toggleFillFromFirst(ex.id)}
                                disabled={
                                  !canEnableFillFromFirst(c) && !c.fillFromFirst
                                }
                              />
                              Fill all sets from Set 1
                            </label>

                            <div className="wd-setsHint">
                              Leave reps/weight blank to save the data based on your first workout.
                            </div>
                          </div>

                          <div className="wd-setsHeader">
                            <span>SET</span>
                            <span>REPS</span>
                            <span>WEIGHT (KG)</span>
                          </div>

                          <div
                            className={
                              "wd-setsRows " +
                              (Number(c.setsCount) > 3 ? "is-scroll" : "")
                            }
                          >
                            {c.rows
                              .slice(0, Math.min(10, Number(c.setsCount)))
                              .map((row, idx) => (
                                <div key={idx} className="wd-setRow">
                                  <div className="wd-setNum">{idx + 1}</div>

                                  <div className="wd-setInputs">
                                    <input
                                      className="wd-setInput"
                                      type="number"
                                      min={1}
                                      inputMode="numeric"
                                      placeholder="0"
                                      value={row.reps}
                                      onChange={(e) =>
                                        updateSetRow(
                                          ex.id,
                                          idx,
                                          "reps",
                                          e.target.value
                                        )
                                      }
                                      disabled={c.fillFromFirst && idx !== 0}
                                    />
                                    <input
                                      className="wd-setInput"
                                      type="number"
                                      min={0}
                                      inputMode="numeric"
                                      placeholder="0"
                                      value={row.weight}
                                      onChange={(e) =>
                                        updateSetRow(
                                          ex.id,
                                          idx,
                                          "weight",
                                          e.target.value
                                        )
                                      }
                                      disabled={c.fillFromFirst && idx !== 0}
                                    />
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {reviewErrors.length > 0 && (
                <div className="wd-review-errors">
                  <div className="wd-review-errorsTitle">
                    Please complete:
                  </div>
                  <ul className="wd-review-errorsList">
                    {reviewErrors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="wd-add-foot">
          <div className="wd-add-footLeft">
            <div className="wd-add-footCount">
              Selected: <strong>{cartCount}</strong>
            </div>
          </div>

          <div className="wd-add-footRight">
            {addStep === "select" ? (
              <>
                <button
                  className="wd-foot-btnGhost"
                  onClick={onClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="wd-foot-btnPrimary"
                  onClick={() => setAddStep("review")}
                  disabled={!canGoNext}
                  type="button"
                >
                  Next
                </button>
              </>
            ) : (
              <>
                <button
                  className="wd-foot-btnGhost"
                  onClick={() => setAddStep("select")}
                  type="button"
                >
                  Back
                </button>
                <button
                  className="wd-foot-btnPrimary"
                  onClick={submitAddToWorkout}
                  disabled={submitAdding || !canSubmitAdd}
                  type="button"
                >
                  {submitAdding ? "Adding…" : "Add to workout"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkoutDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { openModal, closeModal } = useModal();

  const [workout, setWorkout] = useState(null);
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

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
    setTimeout(() => removeToast(tid), 4500);
  };

  const openImageViewer = useCallback(
    (title, imagePath) => {
      const imageUrl = getPublicImageUrl(imagePath) || "";
      let modalId = null;

      modalId = openModal(
        <ImageViewerModal
          title={title || "Exercise"}
          imageUrl={imageUrl}
          onClose={() => closeModal(modalId)}
        />,
        {
          closeOnBackdrop: false,
          closeOnEsc: true,
        }
      );
    },
    [openModal, closeModal]
  );

  /* =======================
     Load workout + exercises
  ======================= */
  async function loadAll() {
    setLoading(true);
    setMsg("");

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
            equipment_id,
            primary_subgroup:muscle_subgroups!exercises_catalog_primary_subgroup_id_fkey (
              id,
              label,
              muscle_groups ( id, label )
            ),
            equipment:equipment ( id, label )
          )
        `
          )
          .eq("workout_id", id)
          .order("order_index"),
      ]);

    if (wErr) {
      setMsg("❌ " + wErr.message);
      setWorkout(null);
      setItems([]);
      setLoading(false);
      return;
    }

    setWorkout(w || null);

    if (exErr) {
      setMsg("❌ " + exErr.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const rawItems = ex || [];

    const varIds = Array.from(
      new Set(rawItems.map((it) => it.variation_id).filter(Boolean))
    );

    let varMap = new Map();
    if (varIds.length > 0) {
      const { data: vData, error: vErr } = await supabase
        .from("exercise_variations")
        .select("id,label")
        .in("id", varIds);

      if (!vErr) {
        (vData || []).forEach((v) => varMap.set(v.id, v.label));
      }
    }

    setItems(
      rawItems.map((it) => ({
        ...it,
        variation_label: it.variation_id
          ? varMap.get(it.variation_id) || null
          : null,
        image_path: it.exercises_catalog?.image_path ?? null,
      }))
    );

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const exercisesCount = items.length;
  const totalSets = items.reduce(
    (acc, it) => acc + normalizeTargets(it.set_targets).length,
    0
  );

  const variationLabelForCard = (it) => {
    if (!it.exercise_id) return null;
    if (it.variation_id && it.variation_label) return it.variation_label;
    if (it.variation_id && !it.variation_label) return "Selected";
    return "None";
  };

  function openAddFlow() {
    let modalId = null;

    modalId = openModal(
      <AddExerciseModal
        workoutId={id}
        existingItems={items}
        onAdded={() => {
          setMsg("✅ Exercises added");
          loadAll();
        }}
        onClose={() => closeModal(modalId)}
        openImageViewer={openImageViewer}
        pushToast={pushToast}
      />,
      {
        closeOnBackdrop: true,
        closeOnEsc: true,
      }
    );
  }

  async function removeExercise(rowId) {
    setMsg("");
    const { error } = await supabase
      .from("workout_exercises")
      .delete()
      .eq("id", rowId);
    if (error) {
      pushToast(error.message);
      return;
    }
    setMsg("✅ Exercise removed");
    loadAll();
  }

  async function startSession() {
    setMsg("");
    const result = await startOrResumeWorkoutSession(id);
    if (result.error || !result.sessionId) {
      pushToast(result.error || "Failed to start session");
      return;
    }
    navigate(`/session/${result.sessionId}?date=${result.dateISO}`);
  }

  function renderSetsDetailed(st) {
    const arr = normalizeTargets(st);
    if (!arr.length) return null;
    return (
      <div className="wd-ex-sets">
        {arr.map((r) => (
          <div key={r.set_index} className="wd-ex-set-row">
            <span className="wd-ex-set-label">Set {r.set_index}</span>
            <span className="wd-ex-set-desc">
              {r.reps ?? "—"} reps × {r.weight ?? "—"} kg
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (loading) {
    return <WorkoutDetailSkeleton />;
  }

  if (!workout) {
    return (
      <div className="wd-page">
        <p className="wd-loading">Workout not found.</p>
      </div>
    );
  }

  return (
    <div className="wd-page wd-content-ready">
      <Toasts toasts={toasts} onClose={removeToast} />

      <header className="wd-header">
        <button className="wd-back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </header>

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

      <section className="wd-add-section">
        <button className="wd-add-card" onClick={openAddFlow}>
          + Add Exercise
        </button>
      </section>

      <section className="wd-ex-list">
        {items.length === 0 && (
          <p className="wd-empty">No exercises yet for this workout.</p>
        )}

        {items.map((it, index) => {
          const summary = summarizeExerciseTargets(it.set_targets);
          const uniformWeight = getUniformWeight(it.set_targets);

          const catalog = it.exercises_catalog || {};
          const subgroup = catalog.primary_subgroup || null;
          const muscleGroupLabel = subgroup?.muscle_groups?.label || null;
          const primaryMuscleLabel = subgroup?.label || null;

          const vLabel = it.exercise_id ? variationLabelForCard(it) : null;
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
                        <span className="wd-chip wd-chip-group">
                          {muscleGroupLabel}
                        </span>
                      )}
                      {primaryMuscleLabel && (
                        <span className="wd-chip wd-chip-primary-muscle">
                          Primary: {primaryMuscleLabel}
                        </span>
                      )}
                      {it.exercise_id && (
                        <span className="wd-chip wd-chip-variation">
                          Var: {vLabel}
                        </span>
                      )}
                      {summary && (
                        <span className="wd-ex-summary">{summary}</span>
                      )}
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
                      if (canOpenImg) openImageViewer(it.exercise_name, it.image_path);
                    }}
                    disabled={!canOpenImg}
                    title={canOpenImg ? "View exercise image" : "No image"}
                    aria-label="View image"
                  >
                    🖼
                  </button>

                  {it.exercise_id && (
                    <Link
                      to={`/progress/id/${it.exercise_id}`}
                      className="wd-ex-progress-link"
                    >
                      Progress
                    </Link>
                  )}

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
    </div>
  );
}