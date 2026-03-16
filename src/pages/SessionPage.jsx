// src/pages/SessionPage.jsx
import "../css/session-page.css";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const BUCKET = "exercise-images";

// reps חייב להיות >0 אם הוזן, weight יכול להיות >=0 אם הוזן
const isPosNum = (v) => v !== "" && Number.isFinite(Number(v)) && Number(v) > 0;
const isNonNegNum = (v) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;

// סידור סטים של תרגיל לפי set_index
function sortTargets(st) {
  if (!Array.isArray(st)) return [];
  return [...st].sort(
    (a, b) => (Number(a.set_index) || 0) - (Number(b.set_index) || 0)
  );
}

// helper: build unique key per exercise+variation
function makeKey(exerciseId, variationId) {
  const ex = String(exerciseId ?? "");
  const v = variationId ? String(variationId) : "null";
  return `${ex}:${v}`;
}

/* ===== Session skeleton ===== */
function SessionPageSkeleton() {
  return (
    <div className="session-page-root">
      <div className="session-page-shell session-content-ready">
        <header className="session-header session-skeleton-fade">
          <div className="session-skeleton session-skeleton-exit" />
          <div className="session-skeleton session-skeleton-date" />
          <div className="session-skeleton session-skeleton-title" />
          <div className="session-skeleton session-skeleton-sub" />
          <div className="session-progress">
            <div className="session-skeleton session-skeleton-progress-fill" />
          </div>
          <div className="session-skeleton session-skeleton-chip" />
        </header>

        <section className="session-card session-skeleton-fade">
          <div className="session-skeleton session-skeleton-card-title" />

          {[1, 2, 3].map((n) => (
            <div key={n} className="session-ex-card">
              <div className="session-ex-header">
                <div className="session-ex-toggle" style={{ cursor: "default" }}>
                  <div className="session-ex-header-main">
                    <div className="session-skeleton session-skeleton-ex-name" />
                    <div className="session-skeleton-chip-row">
                      <div className="session-skeleton session-skeleton-mini-chip" />
                      <div className="session-skeleton session-skeleton-mini-chip session-skeleton-mini-chip--wide" />
                    </div>
                  </div>
                  <div className="session-skeleton session-skeleton-chevron" />
                </div>

                <div className="session-ex-actions">
                  <div className="session-skeleton session-skeleton-icon-btn" />
                  <div className="session-skeleton session-skeleton-mark-btn" />
                </div>
              </div>

              <div className="session-ex-progress">
                <div className="session-skeleton session-skeleton-ex-progress-fill" />
              </div>
            </div>
          ))}
        </section>

        <section className="session-card session-summary-card session-skeleton-fade">
          <div className="session-skeleton session-skeleton-card-title" />
          <div className="session-summary-grid">
            <div className="session-summary-item">
              <div className="session-skeleton session-skeleton-summary-label" />
              <div className="session-skeleton session-skeleton-summary-value" />
            </div>
            <div className="session-summary-item">
              <div className="session-skeleton session-skeleton-summary-label" />
              <div className="session-skeleton session-skeleton-summary-value" />
            </div>
            <div className="session-summary-item">
              <div className="session-skeleton session-skeleton-summary-label" />
              <div className="session-skeleton session-skeleton-summary-value" />
            </div>
          </div>
        </section>

        <div className="session-finish-wrap session-skeleton-fade">
          <div className="session-skeleton session-skeleton-finish-btn" />
        </div>
      </div>
    </div>
  );
}

/* ===== Modal תמונה ===== */
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

/* ===== Confirm Update Modal ===== */
function ConfirmPlanUpdateModal({
  open,
  title,
  setIndex,
  oldReps,
  oldWeight,
  newReps,
  newWeight,
  onConfirm,
  onCancel,
  saving,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="planupd-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="planupd-card" onClick={(e) => e.stopPropagation()}>
        <div className="planupd-head">
          <div className="planupd-title">Update planned set?</div>
          <button className="planupd-x" type="button" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="planupd-body">
          <div className="planupd-sub">
            You logged different values for <strong>{title}</strong> — Set{" "}
            <strong>{setIndex}</strong>. Save this change to the workout plan?
          </div>

          <div className="planupd-compare">
            <div className="planupd-col">
              <div className="planupd-coltitle">Planned</div>
              <div className="planupd-pill">
                Reps: <strong>{oldReps ?? "—"}</strong>
              </div>
              <div className="planupd-pill">
                Weight: <strong>{oldWeight ?? "—"}</strong>
              </div>
            </div>

            <div className="planupd-col">
              <div className="planupd-coltitle">Logged</div>
              <div className="planupd-pill">
                Reps: <strong>{newReps ?? "—"}</strong>
              </div>
              <div className="planupd-pill">
                Weight: <strong>{newWeight ?? "—"}</strong>
              </div>
            </div>
          </div>

          <div className="planupd-note">
            If you choose <strong>Update</strong>, the workout’s planned set_targets
            will be updated for this set.
          </div>
        </div>

        <div className="planupd-foot">
          <button className="planupd-btnGhost" type="button" onClick={onCancel} disabled={saving}>
            Keep plan
          </button>
          <button className="planupd-btnPrimary" type="button" onClick={onConfirm} disabled={saving}>
            {saving ? "Updating…" : "Update plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== כרטיס תרגיל – אקורדיון + כפתור תמונה ===== */
function ExerciseCard({
  exercise,
  meta,
  previousSetByIndex,
  doneSets,
  onLogSet,
  isEnded,
  isSaving,
  onOpenImage,
}) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [localSaving, setLocalSaving] = useState(false);

  const planned = useMemo(
    () => sortTargets(exercise.set_targets),
    [exercise.set_targets]
  );

  const doneCount = doneSets.length;
  const plannedCount = planned.length;
  const nextIndex = doneCount + 1;

  const targetForNext =
    planned.find((r) => Number(r.set_index) === nextIndex) || null;

  // אם אין סטים מתוכננים – לא מגבילים
  const canLogMore = plannedCount === 0 ? true : nextIndex <= plannedCount;

  const progressPct =
    plannedCount > 0
      ? Math.min(100, Math.round((doneCount / plannedCount) * 100))
      : 0;

  // אוטופיל לסט הבא – קודם לפי target, אחרת לפי הסט האחרון שבוצע
  useEffect(() => {
    if (!canLogMore) return;

    if (targetForNext) {
      setWeight(
        targetForNext.weight != null ? String(targetForNext.weight) : ""
      );
      setReps(targetForNext.reps != null ? String(targetForNext.reps) : "");
    } else if (doneSets.length) {
      const last = doneSets[doneSets.length - 1];
      setWeight(last.weight != null ? String(last.weight) : "");
      setReps(last.reps != null ? String(last.reps) : "");
    } else {
      setWeight("");
      setReps("");
    }
  }, [exercise.id, doneSets, targetForNext, canLogMore]);

  async function handleLog() {
    if (!canLogMore || isEnded) return;

    const hasAny = isPosNum(reps) || isNonNegNum(weight);
    if (!hasAny) return;

    setLocalSaving(true);
    await onLogSet(
      exercise.exercise_id,
      exercise.variation_id ?? null,
      weight,
      reps
    );
    setLocalSaving(false);
  }

  const groupLabel = meta?.group_label || null;
  const primaryLabel = meta?.primary_subgroup_label || null;
  const equipmentLabel = meta?.equipment_label || null;
  const detailsLine = [groupLabel, primaryLabel, equipmentLabel].filter(Boolean).join(" • ") || "Unknown";

  const plannedDisplay = plannedCount ? plannedCount : "?";

  const title =
    exercise.variation_label
      ? `${exercise.exercise_name} — ${exercise.variation_label}`
      : exercise.exercise_name;

  return (
    <div className="session-ex-card">
      <div className="session-ex-header">
        <button
          type="button"
          className="session-ex-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <div className="session-ex-header-main">
            <div className="session-ex-name">{title}</div>
            <div className="session-ex-sub">
              <span className={"session-ex-meta-line" + (detailsLine === "Unknown" ? " is-unknown" : "")}>{detailsLine}</span>

              {exercise.variation_label && (
                <span className="session-ex-chip" style={{ marginLeft: 6 }}>
                  {exercise.variation_label}
                </span>
              )}

              <span className="session-ex-sets-label">
                {doneSets.length} / {plannedDisplay} sets
              </span>
            </div>
          </div>

          <div className="session-ex-chevron" aria-hidden="true">
            {open ? "▴" : "▾"}
          </div>
        </button>

        <div className="session-ex-actions">
          <button
            type="button"
            className="session-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenImage(exercise.exercise_id, title, meta?.image_path);
            }}
            disabled={!meta?.image_path}
            title={meta?.image_path ? "View exercise image" : "No image"}
            aria-label="View image"
          >
            🖼
          </button>

          <button
            type="button"
            className="session-mark-btn"
            onClick={(e) => e.stopPropagation()}
            title="Mark (coming soon)"
            aria-label="Mark"
          >
            ○ Mark
          </button>
        </div>
      </div>

      <div className="session-ex-progress">
        <div
          className="session-ex-progress-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {open && (
        <div className="session-ex-body">
          <div className="session-box">
            <div className="session-box-title">Planned Sets</div>
            {planned.length === 0 ? (
              <p className="session-muted">No planned sets.</p>
            ) : (
              planned.map((r) => (
                <div key={r.set_index} className="session-row">
                  <span className="session-row-label">
                    Set {r.set_index || "?"}
                  </span>
                  <span className="session-row-value">
                    : {r.reps ?? 0} reps × {r.weight ?? 0} kg
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="session-box">
            <div className="session-log-header">
              <div className="session-box-title">
                Log Set {canLogMore ? doneSets.length + 1 : doneSets.length}
              </div>
              {targetForNext && (
                <div className="session-log-target">
                  Target:&nbsp;
                  <strong>
                    {targetForNext.reps ?? 0} × {targetForNext.weight ?? 0} kg
                  </strong>
                </div>
              )}
            </div>

            <div className="session-log-grid session-log-grid--compact">
              <div className="session-log-field session-current-field">
                <label className="session-label">Reps</label>
                <div className="session-current-row">
                  <button type="button" className="session-step-btn" onClick={() => setReps(String(Math.max(0, Number(reps || 0) - 1)))} disabled={isEnded || !canLogMore}>−</button>
                  <input
                    className="session-input session-input-current"
                    type="number"
                    inputMode="numeric"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                    disabled={isEnded || !canLogMore}
                  />
                  <button type="button" className="session-step-btn" onClick={() => setReps(String(Number(reps || 0) + 1))} disabled={isEnded || !canLogMore}>+</button>
                </div>
                <div className="session-field-sub">Planned: {targetForNext?.reps ?? "—"}</div>
                <div className="session-field-sub">Last workout: {previousSetByIndex?.get(nextIndex)?.reps ?? "—"}</div>
              </div>
              <div className="session-log-field session-current-field">
                <label className="session-label">Weight (kg)</label>
                <div className="session-current-row">
                  <button type="button" className="session-step-btn" onClick={() => setWeight(String(Math.max(0, Number(weight || 0) - 2.5)))} disabled={isEnded || !canLogMore}>−</button>
                  <input
                    className="session-input session-input-current"
                    type="number"
                    inputMode="numeric"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    disabled={isEnded || !canLogMore}
                  />
                  <button type="button" className="session-step-btn" onClick={() => setWeight(String(Number(weight || 0) + 2.5))} disabled={isEnded || !canLogMore}>+</button>
                </div>
                <div className="session-field-sub">Planned: {targetForNext?.weight ?? "—"} kg</div>
                <div className="session-field-sub">Last workout: {previousSetByIndex?.get(nextIndex)?.weight ?? "—"} kg</div>
              </div>
            </div>

            <button
              type="button"
              className="session-log-btn"
              onClick={handleLog}
              disabled={
                isEnded ||
                !canLogMore ||
                isSaving ||
                localSaving ||
                !(isPosNum(reps) || isNonNegNum(weight))
              }
            >
              {isEnded
                ? "Session completed"
                : !canLogMore
                ? "All sets logged"
                : localSaving || isSaving
                ? "Saving…"
                : `+ Log Set ${doneSets.length + 1}`}
            </button>
          </div>

          <div className="session-box">
            <div className="session-box-title">Completed Sets</div>
            {doneSets.length === 0 ? (
              <p className="session-muted">No sets yet.</p>
            ) : (
              <ul className="session-exercise-list">
                {doneSets.map((s) => (
                  <li key={s.id} className="session-completed-row">
                    <span>
                      Set {s.set_index}: {s.reps ?? "—"} reps × {s.weight ?? "—"} kg
                    </span>
                    <span className="session-timestamp">
                      {new Date(s.created_at).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== עמוד סשן ===== */
export default function SessionPage() {
  const qs = new URLSearchParams(window.location.search);
  const dateISO = qs.get("date");
  const { sessionId } = useParams();

  const [session, setSession] = useState(null);
  const [workoutName, setWorkoutName] = useState("");
  const [workoutItems, setWorkoutItems] = useState([]);
  const [sets, setSets] = useState([]);
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ending, setEnding] = useState(false);

  const [metaByExerciseId, setMetaByExerciseId] = useState(new Map());
  const [previousSetsByKey, setPreviousSetsByKey] = useState(new Map());

  const [imgOpen, setImgOpen] = useState(false);
  const [imgTitle, setImgTitle] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  const [imgLoading, setImgLoading] = useState(false);

  // ✅ confirm modal state
  const [planUpdOpen, setPlanUpdOpen] = useState(false);
  const [planUpdSaving, setPlanUpdSaving] = useState(false);
  const [planUpdPayload, setPlanUpdPayload] = useState(null);

  const fmtLocal = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return iso ?? "";
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    loadInitial();

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sets",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new;
          setSets((prev) =>
            prev.some((s) => s.id === row.id) ? prev : [...prev, row]
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "sets",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.old;
          setSets((prev) => prev.filter((s) => s.id !== row.id));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  started_at: payload.new.started_at,
                  ended_at: payload.new.ended_at,
                }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const loadExerciseMeta = useCallback(async (items) => {
    const ids = Array.from(
      new Set((items || []).map((x) => x.exercise_id).filter(Boolean).map(String))
    );
    if (!ids.length) {
      setMetaByExerciseId(new Map());
      return;
    }

    const { data: exRows, error: exErr } = await supabase
      .from("exercises_catalog")
      .select("id, image_path, primary_subgroup_id, equipment:equipment_id (label)")
      .in("id", ids);

    if (exErr) {
      console.error("exercises_catalog meta error:", exErr);
      return;
    }

    const primarySubgroupIds = Array.from(
      new Set((exRows || []).map((r) => r.primary_subgroup_id).filter(Boolean))
    );

    let subgroups = [];
    if (primarySubgroupIds.length) {
      const { data: sg, error: sgErr } = await supabase
        .from("muscle_subgroups")
        .select("id, label, group_id")
        .in("id", primarySubgroupIds);

      if (sgErr) console.error("muscle_subgroups meta error:", sgErr);
      else subgroups = sg || [];
    }

    const groupIds = Array.from(
      new Set((subgroups || []).map((s) => s.group_id).filter(Boolean))
    );

    let groups = [];
    if (groupIds.length) {
      const { data: g, error: gErr } = await supabase
        .from("muscle_groups")
        .select("id, label")
        .in("id", groupIds);

      if (gErr) console.error("muscle_groups meta error:", gErr);
      else groups = g || [];
    }

    const subgroupById = new Map((subgroups || []).map((s) => [s.id, s]));
    const groupLabelById = new Map((groups || []).map((g) => [g.id, g.label]));

    const map = new Map();
    (exRows || []).forEach((r) => {
      const sg = r.primary_subgroup_id
        ? subgroupById.get(r.primary_subgroup_id)
        : null;
      const groupLabel = sg?.group_id ? groupLabelById.get(sg.group_id) : null;

      map.set(String(r.id), {
        image_path: r.image_path || null,
        primary_subgroup_label: sg?.label || null,
        group_label: groupLabel || null,
        equipment_label: r?.equipment?.label || null,
      });
    });

    setMetaByExerciseId(map);
  }, []);

  const attachVariationLabels = useCallback(async (items) => {
    const variationIds = Array.from(
      new Set((items || []).map((x) => x.variation_id).filter(Boolean).map(String))
    );

    if (!variationIds.length) return items || [];

    const { data: vars, error } = await supabase
      .from("exercise_variations")
      .select("id, label, sort_order")
      .in("id", variationIds);

    if (error) {
      console.error("exercise_variations load error:", error);
      return items || [];
    }

    const labelById = new Map(
      (vars || []).map((v) => [String(v.id), v.label || "Variation"])
    );

    return (items || []).map((it) => ({
      ...it,
      variation_label: it.variation_id
        ? labelById.get(String(it.variation_id)) || "Variation"
        : null,
    }));
  }, []);

  async function loadInitial() {
    setLoading(true);
    setMsg("");

    const { data: s, error: eS } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (eS) {
      setMsg("❌ " + eS.message);
      setLoading(false);
      return;
    }
    setSession(s);

    if (s?.workout_id) {
      const { data: w } = await supabase
        .from("workouts")
        .select("id, name")
        .eq("id", s.workout_id)
        .single();
      if (w?.name) setWorkoutName(w.name);
    }

    if (s?.workout_id) {
      const { data: items, error: eI } = await supabase
        .from("workout_exercises")
        .select("id, exercise_id, exercise_name, variation_id, set_targets, order_index")
        .eq("workout_id", s.workout_id)
        .order("order_index");

      if (eI) setMsg("❌ " + eI.message);

      const cleaned = (items || []).filter((it) => it.exercise_id);

      const withVarLabels = await attachVariationLabels(cleaned);
      setWorkoutItems(withVarLabels);
      await loadExerciseMeta(withVarLabels);
    } else {
      setWorkoutItems([]);
      setMetaByExerciseId(new Map());
      setPreviousSetsByKey(new Map());
    }

    if (s?.workout_id && s?.user_id) {
      const { data: prevSessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("user_id", s.user_id)
        .eq("workout_id", s.workout_id)
        .not("id", "eq", sessionId)
        .not("ended_at", "is", null)
        .order("ended_at", { ascending: false })
        .limit(1);

      const prevSessionId = prevSessions?.[0]?.id;

      if (prevSessionId) {
        const { data: prevSets } = await supabase
          .from("sets")
          .select("exercise_id, variation_id, set_index, reps, weight")
          .eq("session_id", prevSessionId);

        const prevMap = new Map();
        (prevSets || []).forEach((row) => {
          const key = makeKey(row.exercise_id, row.variation_id);
          if (!prevMap.has(key)) prevMap.set(key, new Map());
          prevMap.get(key).set(Number(row.set_index) || 0, row);
        });

        setPreviousSetsByKey(prevMap);
      } else {
        setPreviousSetsByKey(new Map());
      }
    }

    const { data: performed, error: eP } = await supabase
      .from("sets")
      .select("id, exercise_id, exercise_name, variation_id, set_index, weight, reps, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (eP) setMsg("❌ " + eP.message);
    setSets(performed || []);
    setLoading(false);
  }

  const grouped = useMemo(() => {
    const map = new Map();
    for (const st of sets) {
      const key = makeKey(st.exercise_id, st.variation_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(st);
    }
    return map;
  }, [sets]);

  const totalPlannedSets = useMemo(() => {
    let sum = 0;
    for (const it of workoutItems) {
      if (Array.isArray(it.set_targets)) sum += it.set_targets.length;
    }
    return sum;
  }, [workoutItems]);

  const totalLoggedSets = sets.length;
  const progressPct =
    totalPlannedSets > 0
      ? Math.round((totalLoggedSets / totalPlannedSets) * 100)
      : 0;

  const isEnded = !!session?.ended_at;

  async function ensureStartedIfNeeded() {
    if (!session?.id) return;
    if (session.started_at || session.ended_at) return;

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("sessions")
      .update({ started_at: now })
      .eq("id", sessionId)
      .select("id, started_at")
      .single();

    if (!error && data?.started_at) {
      setSession((prev) => (prev ? { ...prev, started_at: data.started_at } : prev));
    }
  }

  function buildUpdatedTargets(existingTargets, setIndex, patch) {
    const base = Array.isArray(existingTargets) ? sortTargets(existingTargets) : [];
    const idx = base.findIndex((x) => Number(x?.set_index) === Number(setIndex));
    const current = idx >= 0 ? base[idx] : { set_index: setIndex, reps: null, weight: null };

    const next = {
      set_index: Number(setIndex),
      reps: patch.reps !== undefined ? patch.reps : (current.reps ?? null),
      weight: patch.weight !== undefined ? patch.weight : (current.weight ?? null),
    };

    const out = [...base];
    if (idx >= 0) out[idx] = next;
    else out.push(next);

    return sortTargets(out);
  }

  async function updatePlanSetTargets(planRowId, setIndex, patch) {
    const currentPlan = workoutItems.find((x) => x.id === planRowId);
    if (!currentPlan) return { ok: false, error: "Plan row not found" };

    const newTargets = buildUpdatedTargets(currentPlan.set_targets, setIndex, patch);

    const { data, error } = await supabase
      .from("workout_exercises")
      .update({ set_targets: newTargets })
      .eq("id", planRowId)
      .select("id, set_targets")
      .single();

    if (error) return { ok: false, error: error.message };

    setWorkoutItems((prev) =>
      prev.map((x) => (x.id === planRowId ? { ...x, set_targets: data.set_targets } : x))
    );

    return { ok: true };
  }

  function shouldAutoUpdateMissingTarget(plannedTarget, logged) {
    const missingReps = plannedTarget?.reps == null;
    const missingWeight = plannedTarget?.weight == null;

    const loggedReps = logged.reps;
    const loggedWeight = logged.weight;

    const hasLoggedAny = loggedReps != null || loggedWeight != null;
    if (!hasLoggedAny) return { ok: false };

    if (missingReps || missingWeight) {
      const patch = {};
      if (missingReps && loggedReps != null) patch.reps = loggedReps;
      if (missingWeight && loggedWeight != null) patch.weight = loggedWeight;
      return { ok: Object.keys(patch).length > 0, patch };
    }

    return { ok: false };
  }

  function shouldPromptUpdateDifferent(plannedTarget, logged) {
    if (!plannedTarget) return { ok: false };

    const plannedReps = plannedTarget.reps;
    const plannedWeight = plannedTarget.weight;
    const plannedHasBoth = plannedReps != null && plannedWeight != null;

    const loggedReps = logged.reps;
    const loggedWeight = logged.weight;

    const hasLoggedAny = loggedReps != null || loggedWeight != null;
    if (!hasLoggedAny) return { ok: false };

    if (!plannedHasBoth) return { ok: false };

    const repsChanged = loggedReps != null && Number(loggedReps) !== Number(plannedReps);
    const weightChanged = loggedWeight != null && Number(loggedWeight) !== Number(plannedWeight);

    if (!repsChanged && !weightChanged) return { ok: false };

    return {
      ok: true,
      oldReps: plannedReps,
      oldWeight: plannedWeight,
      newReps: loggedReps,
      newWeight: loggedWeight,
      patch: {
        reps: loggedReps != null ? Number(loggedReps) : undefined,
        weight: loggedWeight != null ? Number(loggedWeight) : undefined,
      },
    };
  }

  async function logSetForExercise(exerciseId, variationId, weight, reps) {
    setMsg("");

    if (isEnded) {
      setMsg("❌ Session already completed");
      return;
    }

    const repsOk = isPosNum(reps);
    const weightOk = isNonNegNum(weight);
    if (!repsOk && !weightOk) {
      setMsg("❌ Enter reps and/or weight");
      return;
    }

    const repsVal = repsOk ? Number(reps) : null;
    const weightVal = weightOk ? Number(weight) : null;

    const exIdStr = String(exerciseId);
    const vIdStr = variationId ? String(variationId) : null;

    const plan = workoutItems.find(
      (x) =>
        String(x.exercise_id) === exIdStr &&
        (x.variation_id ? String(x.variation_id) : null) === vIdStr
    );

    if (!plan) {
      setMsg("❌ Exercise not found (variation mismatch)");
      return;
    }

    const key = makeKey(plan.exercise_id, plan.variation_id);
    const already = grouped.get(key) || [];
    const nextIndex = already.length + 1;

    const plannedCount = Array.isArray(plan.set_targets) ? plan.set_targets.length : 0;

    if (plannedCount && nextIndex > plannedCount) {
      setMsg("❌ All planned sets for this exercise are already logged");
      return;
    }

    setSaving(true);
    await ensureStartedIfNeeded();

    const { data, error } = await supabase
      .from("sets")
      .insert({
        session_id: sessionId,
        exercise_id: plan.exercise_id,
        exercise_name: plan.exercise_name ?? "",
        variation_id: plan.variation_id ?? null,
        set_index: nextIndex,
        weight: weightVal,
        reps: repsVal,
      })
      .select("id, exercise_id, exercise_name, variation_id, set_index, weight, reps, created_at")
      .single();

    setSaving(false);

    if (error) {
      setMsg("❌ " + error.message);
      return;
    }

    setSets((prev) => [...prev, data]);
    setMsg("✅ Set logged");

    const plannedArr = sortTargets(plan.set_targets);
    const plannedTarget = plannedArr.find((t) => Number(t?.set_index) === Number(nextIndex)) || null;

    const logged = { reps: repsVal, weight: weightVal };

    const auto = shouldAutoUpdateMissingTarget(plannedTarget, logged);
    if (auto.ok) {
      const res = await updatePlanSetTargets(plan.id, nextIndex, auto.patch);
      if (!res.ok) console.warn("Auto update plan failed:", res.error);
      return;
    }

    const diff = shouldPromptUpdateDifferent(plannedTarget, logged);
    if (diff.ok) {
      const title =
        plan.variation_label
          ? `${plan.exercise_name} — ${plan.variation_label}`
          : plan.exercise_name;

      setPlanUpdPayload({
        planId: plan.id,
        title,
        setIndex: nextIndex,
        oldReps: diff.oldReps,
        oldWeight: diff.oldWeight,
        newReps: diff.newReps,
        newWeight: diff.newWeight,
        patchReps: diff.patch.reps,
        patchWeight: diff.patch.weight,
      });
      setPlanUpdOpen(true);
    }
  }

  async function finishSession() {
    setMsg("");
    if (!session?.id || !!session?.ended_at) return;

    setEnding(true);

    const updates = { ended_at: new Date().toISOString() };
    if (!session.started_at) updates.started_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("sessions")
      .update(updates)
      .eq("id", sessionId)
      .select("id, started_at, ended_at")
      .single();

    setEnding(false);

    if (error) {
      setMsg("❌ " + error.message);
      return;
    }
    if (!data) {
      setMsg("❌ Update blocked (check RLS)");
      return;
    }

    setSession((prev) =>
      prev
        ? {
            ...prev,
            started_at: data.started_at ?? prev.started_at,
            ended_at: data.ended_at,
          }
        : prev
    );

    setMsg("✅ Session completed");
  }

  const openExerciseImage = useCallback(async (exerciseId, exerciseName, imagePath) => {
    const path = imagePath || null;
    setImgTitle(exerciseName || "Exercise image");
    setImgUrl("");
    setImgOpen(true);

    if (!path) return;

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

  async function confirmPlanUpdate() {
    if (!planUpdPayload) return;
    setPlanUpdSaving(true);

    const patch = {
      reps: planUpdPayload.patchReps,
      weight: planUpdPayload.patchWeight,
    };

    const res = await updatePlanSetTargets(planUpdPayload.planId, planUpdPayload.setIndex, patch);
    setPlanUpdSaving(false);

    if (!res.ok) {
      setMsg("❌ Failed to update plan: " + res.error);
    } else {
      setMsg("✅ Plan updated");
    }

    setPlanUpdOpen(false);
    setPlanUpdPayload(null);
  }

  function cancelPlanUpdate() {
    setPlanUpdOpen(false);
    setPlanUpdPayload(null);
  }

  if (loading) return <SessionPageSkeleton />;

  const dateLabel =
    session?.session_date || dateISO
      ? new Date(session?.session_date || dateISO).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "N/A";

  const startedLabel = session?.started_at ? fmtLocal(session.started_at) : null;

  return (
    <div className="session-page-root">
      <div className="session-page-shell session-content-ready">
        <header className="session-header">
          <button
            type="button"
            className="session-header-exit"
            onClick={() => navigate("/workout")}
          >
            ← Exit
          </button>

          <div className="session-header-date">{dateLabel}</div>

          <h2 className="session-header-title">
            {workoutName || "Workout Session"}
          </h2>

          <div className="session-header-sub">
            <span>{workoutItems.length} exercises</span>
            <span>• {sets.length} / {totalPlannedSets || 0} sets logged</span>
            <span>• {progressPct}%</span>
          </div>

          <div className="session-progress">
            <div className="session-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          {!isEnded && startedLabel && (
            <div className="session-header-chip">In progress {startedLabel}</div>
          )}

          {isEnded && (
            <div className="session-header-chip">
              Completed {fmtLocal(session.ended_at)}
            </div>
          )}
        </header>

        <section className="session-card">
          <h3 className="session-card-title">Exercises</h3>

          {workoutItems.length === 0 && (
            <p className="session-muted">No exercises in this workout.</p>
          )}

          {workoutItems.map((it) => {
            const key = makeKey(it.exercise_id, it.variation_id);
            const done = grouped.get(key) || [];
            const meta = metaByExerciseId.get(String(it.exercise_id)) || null;

            return (
              <ExerciseCard
                key={it.id}
                exercise={it}
                meta={meta}
                previousSetByIndex={previousSetsByKey.get(key) || null}
                doneSets={done}
                onLogSet={logSetForExercise}
                isEnded={isEnded}
                isSaving={saving}
                onOpenImage={openExerciseImage}
              />
            );
          })}
        </section>

        <section className="session-card session-summary-card">
          <h3 className="session-card-title">Session summary</h3>
          <div className="session-summary-grid">
            <div className="session-summary-item">
              <div className="session-summary-label">Total sets</div>
              <div className="session-summary-value">{sets.length}</div>
            </div>
            <div className="session-summary-item">
              <div className="session-summary-label">Planned sets</div>
              <div className="session-summary-value">{totalPlannedSets || 0}</div>
            </div>
            <div className="session-summary-item">
              <div className="session-summary-label">Progress</div>
              <div className="session-summary-value">
                {progressPct}
                <span className="session-summary-suffix">%</span>
              </div>
            </div>
          </div>

          {msg && (
            <p className="session-message" style={{ marginTop: 8 }}>
              {msg}
            </p>
          )}
        </section>

        <div className="session-finish-wrap">
          <button
            className="session-finish-btn"
            onClick={finishSession}
            disabled={ending || isEnded}
          >
            {isEnded ? "Session completed" : ending ? "Finishing…" : "Finish Session"}
          </button>
        </div>
      </div>

      <ImageModal
        open={imgOpen}
        title={imgTitle}
        imageUrl={imgUrl}
        loading={imgLoading}
        onClose={() => {
          setImgOpen(false);
          setImgUrl("");
          setImgTitle("");
        }}
      />

      <ConfirmPlanUpdateModal
        open={planUpdOpen}
        title={planUpdPayload?.title || ""}
        setIndex={planUpdPayload?.setIndex || 1}
        oldReps={planUpdPayload?.oldReps ?? null}
        oldWeight={planUpdPayload?.oldWeight ?? null}
        newReps={planUpdPayload?.newReps ?? null}
        newWeight={planUpdPayload?.newWeight ?? null}
        onConfirm={confirmPlanUpdate}
        onCancel={cancelPlanUpdate}
        saving={planUpdSaving}
      />
    </div>
  );
}
