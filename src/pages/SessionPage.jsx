import "../css/session-page.css";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useModal } from "../components/ModalProvider";

const BUCKET = "exercise-images";
const REST_TIMER_DEFAULT = 90;
const REST_TIMER_STEP = 10;
const WEIGHT_STEP = 2.5;
const FINISH_REDIRECT_DELAY = 2400;

const isPosNum = (v) => v !== "" && Number.isFinite(Number(v)) && Number(v) > 0;
const isNonNegNum = (v) => v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;

function sortTargets(st) {
  if (!Array.isArray(st)) return [];
  return [...st].sort(
    (a, b) => (Number(a?.set_index) || 0) - (Number(b?.set_index) || 0)
  );
}

function makeKey(exerciseId, variationId) {
  const ex = String(exerciseId ?? "");
  const v = variationId ? String(variationId) : "null";
  return `${ex}:${v}`;
}

function makeSetKey(exerciseId, variationId, setIndex) {
  return `${makeKey(exerciseId, variationId)}:${Number(setIndex) || 0}`;
}

function fmtTimer(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatWeight(weight) {
  return weight == null ? "—" : `${weight} lbs`;
}

function formatStepValue(value) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function adjustWeightString(prev, delta) {
  const n = Number(prev || 0);
  const next = Math.max(0, Math.round((n + delta) * 100) / 100);
  return formatStepValue(next);
}

function ExerciseImageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="session-icon-svg" aria-hidden="true">
      <path d="M4.5 6.75h3.36l1.2-1.8A1.5 1.5 0 0 1 10.31 4.2h3.39a1.5 1.5 0 0 1 1.25.75l1.19 1.8h3.36A2.25 2.25 0 0 1 21.75 9v9.75A2.25 2.25 0 0 1 19.5 21H4.5a2.25 2.25 0 0 1-2.25-2.25V9A2.25 2.25 0 0 1 4.5 6.75Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="13.25" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function getPublicImageUrl(path) {
  if (!path) return null;
  if (typeof path === "string" && /^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

function formatElapsed(startedAt, endedAt) {
  if (!startedAt) return "00:00";
  const startMs = new Date(startedAt).getTime();
  const endMs = endedAt ? new Date(endedAt).getTime() : Date.now();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "00:00";

  const totalSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;

  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(
      ss
    ).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function SessionPageSkeleton() {
  return (
    <div className="session-page-root">
      <div className="session-page-shell session-content-ready">
        <header className="session-header-sticky-wrap session-skeleton-fade">
          <div className="session-header-card">
            <div className="session-skeleton session-skeleton-date" />
            <div className="session-skeleton session-skeleton-title" />
            <div className="session-skeleton session-skeleton-sub" />
            <div className="session-progress">
              <div className="session-skeleton session-skeleton-progress-fill" />
            </div>
            <div className="session-skeleton session-skeleton-chip" />
          </div>
        </header>

        <section className="session-exercises-wrap session-skeleton-fade">
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
                </div>
              </div>

              <div className="session-ex-progress">
                <div className="session-skeleton session-skeleton-ex-progress-fill" />
              </div>
            </div>
          ))}

          <div className="session-finish-inline-wrap session-skeleton-fade">
            <div className="session-skeleton session-skeleton-finish-btn" />
          </div>
        </section>
      </div>
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

function UpdatePlanModalContent({
  exerciseTitle,
  diffs,
  saving,
  onConfirm,
  onCancel,
}) {
  const sortedDiffs = useMemo(
    () =>
      [...(diffs || [])].sort(
        (a, b) => (Number(a?.set_index) || 0) - (Number(b?.set_index) || 0)
      ),
    [diffs]
  );

  return (
    <div className="planupd-shell">
      <div className="planupd-head">
        <div className="planupd-title">Update plan for next time?</div>
        <button
          className="planupd-x"
          type="button"
          onClick={onCancel}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="planupd-body">
        <div className="planupd-sub">
          We found differences between the planned sets and what you actually
          logged for <strong>{exerciseTitle}</strong>.
        </div>

        <div className="planupd-compare">
          <div className="planupd-col">
            <div className="planupd-coltitle">Logged</div>
            <div className="planupd-rows-scroll">
              {sortedDiffs.map((d) => (
              <div key={`logged-${d.set_index}`} className="planupd-rowcard">
                <div className="planupd-rowset">Set #{d.set_index}</div>
                <div className="planupd-pill">
                  Reps: <strong>{d.loggedReps ?? "—"}</strong>
                </div>
                <div className="planupd-pill">
                  Weight: <strong>{d.loggedWeight ?? "—"}</strong>
                </div>
              </div>
              ))}
            </div>
          </div>

          <div className="planupd-col">
            <div className="planupd-coltitle">Planned</div>
            <div className="planupd-rows-scroll">
              {sortedDiffs.map((d) => (
              <div key={`planned-${d.set_index}`} className="planupd-rowcard">
                <div className="planupd-rowset">Set #{d.set_index}</div>
                <div className="planupd-pill">
                  Reps: <strong>{d.plannedReps ?? "—"}</strong>
                </div>
                <div className="planupd-pill">
                  Weight: <strong>{d.plannedWeight ?? "—"}</strong>
                </div>
              </div>
              ))}
            </div>
          </div>
        </div>

        <div className="planupd-note">
          Only the sets shown here will be updated in the workout plan.
        </div>
      </div>

      <div className="planupd-foot">
        <button
          className="planupd-btnGhost"
          type="button"
          onClick={onCancel}
          disabled={saving}
        >
          Keep as is
        </button>
        <button
          className="planupd-btnPrimary"
          type="button"
          onClick={onConfirm}
          disabled={saving}
        >
          {saving ? "Updating…" : "Update"}
        </button>
      </div>
    </div>
  );
}

function RestTimer({
  open,
  seconds,
  onClose,
  onIncrease,
  onDecrease,
  isReady,
  baseSeconds,
}) {
  if (!open) return null;

  const pct =
    baseSeconds > 0
      ? Math.max(0, Math.min(100, (seconds / baseSeconds) * 100))
      : 0;

  return (
    <div className="rest-timer-viewport">
      <div className="rest-timer-panel" aria-live="polite">
        <div className="rest-timer-head">
          <div className="rest-timer-title">
            ⏱ {isReady ? "You’re ready" : "Rest Timer"}
          </div>
          <button
            type="button"
            className="rest-timer-close"
            onClick={onClose}
            aria-label="Close timer"
          >
            ✕
          </button>
        </div>

        <div className="rest-timer-main">
          <button
            type="button"
            className="rest-timer-step"
            onClick={onDecrease}
            aria-label="Decrease timer"
          >
            −
          </button>

          <div className="rest-timer-value">
            {isReady ? "READY" : fmtTimer(seconds)}
          </div>

          <button
            type="button"
            className="rest-timer-step"
            onClick={onIncrease}
            aria-label="Increase timer"
          >
            +
          </button>
        </div>

        <div className="rest-timer-sub">
          {isReady ? "You can start your next set." : "Take a short break and reset."}
        </div>

        <div className="rest-timer-bar">
          <div className="rest-timer-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function FinishSuccessOverlay({ open }) {
  if (!open) return null;

  return (
    <div className="session-finish-overlay" role="status" aria-live="polite">
      <div className="session-finish-overlay-card">
        <div className="session-finish-overlay-icon">✓</div>
        <div className="session-finish-overlay-title">Workout Completed</div>
        <div className="session-finish-overlay-text">
          Great job. Your session was saved successfully.
        </div>
      </div>
    </div>
  );
}

function ExerciseCard({
  exercise,
  meta,
  doneSets,
  lastSetMap,
  onLogSet,
  onLogRemainingAsPlanned,
  onOpenPlanUpdate,
  onExerciseCompleted,
  isEnded,
  isSaving,
  onOpenImage,
  isOpen,
  onToggle,
  registerCardRef,
}) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [localSaving, setLocalSaving] = useState(false);
  const [setAdvanceFx, setSetAdvanceFx] = useState(false);
  const prefillKeyRef = useRef("");

  const planned = useMemo(() => sortTargets(exercise.set_targets), [exercise.set_targets]);

  const doneCount = doneSets.length;
  const plannedCount = planned.length;
  const nextIndex = doneCount + 1;

  const targetForNext =
    planned.find((r) => Number(r?.set_index) === Number(nextIndex)) || null;

  const lastForNext =
    lastSetMap.get(makeSetKey(exercise.exercise_id, exercise.variation_id, nextIndex)) ||
    null;

  const canLogMore = plannedCount === 0 ? true : nextIndex <= plannedCount;

  const progressPct =
    plannedCount > 0
      ? Math.min(100, Math.round((doneCount / plannedCount) * 100))
      : 0;

  useEffect(() => {
    if (!canLogMore) return;

    const prefillKey = `${exercise.id || "ex"}:${nextIndex}`;
    if (prefillKeyRef.current === prefillKey) return;
    prefillKeyRef.current = prefillKey;

    if (targetForNext) {
      setWeight(targetForNext.weight != null ? String(targetForNext.weight) : "");
      setReps(targetForNext.reps != null ? String(targetForNext.reps) : "");
    } else if (doneSets.length) {
      const last = doneSets[doneSets.length - 1];
      setWeight(last?.weight != null ? String(last.weight) : "");
      setReps(last?.reps != null ? String(last.reps) : "");
    } else {
      setWeight("");
      setReps("");
    }
  }, [exercise.id, doneSets, targetForNext, canLogMore, nextIndex]);

  const title = exercise.exercise_name || "Exercise";

  const detailsText = [meta?.group_label, meta?.primary_subgroup_label]
    .filter(Boolean)
    .join(" • ");

  const canOpenImage = !!meta?.image_path;

  const diffs = useMemo(() => {
    if (!planned.length || !doneSets.length) return [];

    return planned
      .map((target) => {
        const setIndex = Number(target?.set_index) || 0;
        const logged = doneSets.find((s) => Number(s?.set_index) === setIndex);
        if (!logged) return null;

        const plannedReps = target?.reps ?? null;
        const plannedWeight = target?.weight ?? null;
        const loggedReps = logged?.reps ?? null;
        const loggedWeight = logged?.weight ?? null;

        const repsChanged =
          plannedReps != null &&
          loggedReps != null &&
          Number(plannedReps) !== Number(loggedReps);

        const weightChanged =
          plannedWeight != null &&
          loggedWeight != null &&
          Number(plannedWeight) !== Number(loggedWeight);

        if (!repsChanged && !weightChanged) return null;

        return {
          set_index: setIndex,
          plannedReps,
          plannedWeight,
          loggedReps,
          loggedWeight,
        };
      })
      .filter(Boolean);
  }, [planned, doneSets]);

  const showPerformanceChanged =
    doneCount >= plannedCount && plannedCount > 0 && diffs.length > 0;

  const futureSets = useMemo(() => {
    return planned.filter((p) => Number(p?.set_index) > Number(nextIndex));
  }, [planned, nextIndex]);

  useEffect(() => {
    if (doneCount <= 0) return;
    setSetAdvanceFx(true);
    const id = window.setTimeout(() => setSetAdvanceFx(false), 360);
    return () => window.clearTimeout(id);
  }, [nextIndex, doneCount]);

  async function handleLog() {
    if (!canLogMore || isEnded) return;

    const hasAny = isPosNum(reps) || isNonNegNum(weight);
    if (!hasAny) return;

    setLocalSaving(true);
    const result = await onLogSet(exercise.exercise_id, exercise.variation_id ?? null, weight, reps);
    setLocalSaving(false);

    const loggedFinalSet = plannedCount > 0 && nextIndex >= plannedCount;
    if (result?.ok && loggedFinalSet && !result?.hasPlanDiff) {
      onExerciseCompleted(exercise.id);
    }
  }

  return (
    <div className="session-ex-card" ref={(node) => registerCardRef(exercise.id, node)}>
      <div className="session-ex-header">
        <button
          type="button"
          className="session-ex-toggle"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <div className="session-ex-header-main">
            <div className="session-ex-name">{title}</div>

            <div className="session-ex-meta-row">
              {detailsText ? (
                <span className="session-ex-meta-text">{detailsText}</span>
              ) : (
                <span className="session-ex-meta-text is-muted">Unknown details</span>
              )}

              {meta?.equipment_label && (
                <span className="session-ex-equipment-chip">{meta.equipment_label}</span>
              )}

              {exercise?.variation_label && (
                <span className="session-ex-variation-chip">{exercise.variation_label}</span>
              )}
            </div>

            <div className="session-ex-sets-line">
              {doneCount}/{plannedCount || 0} sets
            </div>
          </div>

          <div className="session-ex-chevron" aria-hidden="true">
            {isOpen ? "▴" : "▾"}
          </div>
        </button>

        <div className="session-ex-actions">
          <button
            type="button"
            className="session-icon-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!canOpenImage) return;
              onOpenImage(title, meta?.image_path);
            }}
            disabled={!canOpenImage}
            title={canOpenImage ? "View exercise image" : "No image"}
            aria-label="View image"
          >
            <ExerciseImageIcon />
          </button>
        </div>
      </div>

      <div className="session-ex-progress">
        <div
          className="session-ex-progress-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className={`session-ex-body-wrap ${isOpen ? "is-open" : ""}`}>
        <div className="session-ex-body">
          {planned.length > 0 && (
            <div className="session-target-compare">
              <div className="session-target-box">
                <div className="session-target-box-title">TARGET</div>
                {planned.map((r) => (
                  <div key={`target-${r.set_index}`} className="session-target-row">
                    <span className="session-target-index">#{r.set_index}</span>
                    <span className="session-target-value">
                      {r.reps ?? "—"}r × {formatWeight(r.weight)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="session-target-box">
                <div className="session-target-box-title">LAST TIME</div>
                {planned.map((r) => {
                  const last =
                    lastSetMap.get(
                      makeSetKey(exercise.exercise_id, exercise.variation_id, r.set_index)
                    ) || null;

                  return (
                    <div key={`last-${r.set_index}`} className="session-target-row">
                      <span className="session-target-index">#{r.set_index}</span>
                      <span className="session-target-value session-target-value--accent">
                        {last?.reps ?? "—"}r × {formatWeight(last?.weight)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {plannedCount > 0 && doneCount < plannedCount && (
            <button
              type="button"
              className="session-log-remaining-btn"
              onClick={() => onLogRemainingAsPlanned(exercise)}
              disabled={isSaving || localSaving || isEnded}
            >
              Log Remaining as Planned
            </button>
          )}

          <div className="session-set-flow">
            {doneSets.map((s) => {
              const last =
                lastSetMap.get(
                  makeSetKey(exercise.exercise_id, exercise.variation_id, s.set_index)
                ) || null;

              return (
                <div key={s.id} className="session-done-card">
                  <div className="session-done-check">✓</div>

                  <div className="session-done-main">
                    <div className="session-done-set-label">Set {s.set_index}</div>
                    <div className="session-done-value">
                      {s.reps ?? "—"} × {s.weight ?? "—"} lbs
                    </div>
                    <div className="session-done-last">
                      Last: {last?.reps ?? "—"} × {last?.weight ?? "—"} lbs
                    </div>
                  </div>

                  <div className="session-done-status">✓ Done</div>
                </div>
              );
            })}

            {canLogMore && !isEnded && (
              <div className={`session-active-set-card ${setAdvanceFx ? "is-advancing" : ""}`}>
                <div className="session-active-top">
                  <div className="session-active-badge">#{nextIndex}</div>

                  <div className="session-active-top-main">
                    <div className="session-active-kicker">NEXT SET</div>
                    <div className="session-active-lastline">
                      Last workout: {lastForNext?.reps ?? "—"}r × {lastForNext?.weight ?? "—"}lbs
                    </div>
                  </div>
                </div>

                <div className="session-active-controls">
                  <div className="session-value-box">
                    <div className="session-value-label">REPS</div>

                    <div className="session-stepper">
                      <button
                        type="button"
                        className="session-step-btn"
                        onClick={() =>
                          setReps((prev) => {
                            const n = Number(prev || 0);
                            return String(Math.max(0, n - 1));
                          })
                        }
                      >
                        −
                      </button>

                      <div className="session-value-main">{reps || "0"}</div>

                      <button
                        type="button"
                        className="session-step-btn"
                        onClick={() =>
                          setReps((prev) => {
                            const n = Number(prev || 0);
                            return String(n + 1);
                          })
                        }
                      >
                        +
                      </button>
                    </div>

                    <div className="session-value-meta">
                      Planned: {targetForNext?.reps ?? "—"}
                    </div>
                    <div className="session-value-meta">
                      Last workout: {lastForNext?.reps ?? "—"}
                    </div>
                  </div>

                  <div className="session-value-box">
                    <div className="session-value-label">WEIGHT</div>

                    <div className="session-stepper">
                      <button
                        type="button"
                        className="session-step-btn"
                        onClick={() =>
                          setWeight((prev) => {
                            return adjustWeightString(prev, -WEIGHT_STEP);
                          })
                        }
                      >
                        −
                      </button>

                      <div className="session-value-main">{weight || "0"}</div>

                      <button
                        type="button"
                        className="session-step-btn"
                        onClick={() =>
                          setWeight((prev) => {
                            return adjustWeightString(prev, WEIGHT_STEP);
                          })
                        }
                      >
                        +
                      </button>
                    </div>

                    <div className="session-value-meta">
                      Planned: {targetForNext?.weight ?? "—"} lbs
                    </div>
                    <div className="session-value-meta">
                      Last workout: {lastForNext?.weight ?? "—"} lbs
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="session-log-btn session-log-btn--primary"
                  onClick={handleLog}
                  disabled={
                    isEnded ||
                    !canLogMore ||
                    isSaving ||
                    localSaving ||
                    !(isPosNum(reps) || isNonNegNum(weight))
                  }
                >
                  {localSaving || isSaving ? "Saving…" : "Log Set"}
                </button>
              </div>
            )}

            {futureSets.map((future) => {
              const last =
                lastSetMap.get(
                  makeSetKey(exercise.exercise_id, exercise.variation_id, future.set_index)
                ) || null;

              return (
                <div key={`future-${future.set_index}`} className="session-upcoming-row">
                  <div className="session-upcoming-left">#{future.set_index}</div>

                  <div className="session-upcoming-main">
                    <div className="session-upcoming-values">
                      <span>{future.reps ?? "—"} reps</span>
                      <span>{future.weight ?? "—"} lbs</span>
                    </div>
                    <div className="session-upcoming-last">
                      ({last?.reps ?? "—"}) &nbsp;&nbsp; ({last?.weight ?? "—"})
                    </div>
                  </div>

                  <div className="session-upcoming-status">Upcoming</div>
                </div>
              );
            })}
          </div>

          {showPerformanceChanged && (
            <div className="session-plan-alert">
              <div className="session-plan-alert-icon">i</div>

              <div className="session-plan-alert-main">
                <div className="session-plan-alert-title">Performance Changed</div>
                <div className="session-plan-alert-text">
                  Update your plan to match today’s performance?
                </div>

                <button
                  type="button"
                  className="session-plan-alert-btn"
                  onClick={() => onOpenPlanUpdate(exercise, diffs)}
                >
                  Update Plan for Next Time
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SessionPage() {
  const qs = new URLSearchParams(window.location.search);
  const dateISO = qs.get("date");
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { openModal, closeModal } = useModal();

  const [session, setSession] = useState(null);
  const [workoutName, setWorkoutName] = useState("");
  const [workoutItems, setWorkoutItems] = useState([]);
  const [sets, setSets] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ending, setEnding] = useState(false);

  const [metaByExerciseId, setMetaByExerciseId] = useState(new Map());
  const [lastWorkoutSetMap, setLastWorkoutSetMap] = useState(new Map());

  const [restOpen, setRestOpen] = useState(false);
  const [restSeconds, setRestSeconds] = useState(REST_TIMER_DEFAULT);
  const [restBaseSeconds, setRestBaseSeconds] = useState(REST_TIMER_DEFAULT);

  const [openExerciseIds, setOpenExerciseIds] = useState(() => new Set());
  const [pendingAutoScrollExerciseId, setPendingAutoScrollExerciseId] = useState(null);
  const exercisesWrapRef = useRef(null);
  const exerciseCardRefs = useRef(new Map());

  const [planModalSaving, setPlanModalSaving] = useState(false);
  const [showFinishOverlay, setShowFinishOverlay] = useState(false);

  const finishRedirectRef = useRef(null);
  const tickRef = useRef(null);
  const [nowTick, setNowTick] = useState(Date.now());

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
    if (!restOpen) return;
    if (restSeconds <= 0) return;

    const id = window.setInterval(() => {
      setRestSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(id);
  }, [restOpen, restSeconds]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    tickRef.current = interval;
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

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
          setSets((prev) => (prev.some((s) => s.id === row.id) ? prev : [...prev, row]));
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
      if (finishRedirectRef.current) {
        window.clearTimeout(finishRedirectRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const startRestTimer = useCallback((seconds = REST_TIMER_DEFAULT) => {
    setRestBaseSeconds(seconds);
    setRestSeconds(seconds);
    setRestOpen(true);
  }, []);

  const closeRestTimer = useCallback(() => {
    setRestOpen(false);
  }, []);

  const registerExerciseCardRef = useCallback((exerciseId, node) => {
    if (!exerciseId) return;
    if (!node) {
      exerciseCardRefs.current.delete(exerciseId);
      return;
    }
    exerciseCardRefs.current.set(exerciseId, node);
  }, []);

  const scrollExerciseCardIntoView = useCallback((exerciseId) => {
    const card = exerciseCardRefs.current.get(exerciseId);
    if (!card) return;

    card.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  }, []);

  const advanceToNextExercise = useCallback((exerciseId) => {
    const idx = workoutItems.findIndex((it) => it.id === exerciseId);
    if (idx < 0) return;

    const next = workoutItems[idx + 1] || null;

    setOpenExerciseIds((prev) => {
      const nextSet = new Set(prev);
      nextSet.delete(exerciseId);
      if (next?.id) nextSet.add(next.id);
      return nextSet;
    });

    setPendingAutoScrollExerciseId(next?.id ?? null);
  }, [workoutItems]);

  useEffect(() => {
    if (!pendingAutoScrollExerciseId) return;
    if (!openExerciseIds.has(pendingAutoScrollExerciseId)) return;

    const timeoutId = window.setTimeout(() => {
      scrollExerciseCardIntoView(pendingAutoScrollExerciseId);
      setPendingAutoScrollExerciseId(null);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [pendingAutoScrollExerciseId, openExerciseIds, scrollExerciseCardIntoView]);

  const loadExerciseMeta = useCallback(async (items) => {
    const ids = Array.from(
      new Set((items || []).map((x) => x.exercise_id).filter(Boolean).map(String))
    );

    if (!ids.length) {
      setMetaByExerciseId(new Map());
      return;
    }

    const { data: exRows, error } = await supabase
      .from("exercises_catalog")
      .select(`
        id,
        image_path,
        primary_subgroup:muscle_subgroups!exercises_catalog_primary_subgroup_id_fkey (
          id,
          label,
          muscle_groups ( id, label )
        ),
        equipment:equipment (
          id,
          label
        )
      `)
      .in("id", ids);

    if (error) {
      console.error("exercises_catalog meta error:", error);
      return;
    }

    const map = new Map();

    (exRows || []).forEach((r) => {
      map.set(String(r.id), {
        image_path: r.image_path || null,
        primary_subgroup_label: r?.primary_subgroup?.label || null,
        group_label: r?.primary_subgroup?.muscle_groups?.label || null,
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

  const loadPreviousWorkoutSets = useCallback(async (sessionRow) => {
    if (!sessionRow?.workout_id || !sessionRow?.user_id) {
      setLastWorkoutSetMap(new Map());
      return;
    }

    const { data: prevSessions, error: prevSessionsErr } = await supabase
      .from("sessions")
      .select("id, ended_at")
      .eq("user_id", sessionRow.user_id)
      .eq("workout_id", sessionRow.workout_id)
      .not("ended_at", "is", null)
      .neq("id", sessionRow.id)
      .order("ended_at", { ascending: false })
      .limit(10);

    if (prevSessionsErr) {
      console.error("previous sessions load error:", prevSessionsErr);
      setLastWorkoutSetMap(new Map());
      return;
    }

    const prevSessionIds = (prevSessions || []).map((x) => x.id).filter(Boolean);
    if (!prevSessionIds.length) {
      setLastWorkoutSetMap(new Map());
      return;
    }

    const { data: prevSets, error: prevSetsErr } = await supabase
      .from("sets")
      .select(
        "id, session_id, exercise_id, variation_id, set_index, weight, reps, created_at"
      )
      .in("session_id", prevSessionIds)
      .order("created_at", { ascending: false });

    if (prevSetsErr) {
      console.error("previous sets load error:", prevSetsErr);
      setLastWorkoutSetMap(new Map());
      return;
    }

    const map = new Map();
    for (const row of prevSets || []) {
      const key = makeSetKey(row.exercise_id, row.variation_id, row.set_index);
      if (!map.has(key)) map.set(key, row);
    }

    setLastWorkoutSetMap(map);
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
        .select(
          "id, exercise_id, exercise_name, variation_id, set_targets, order_index"
        )
        .eq("workout_id", s.workout_id)
        .order("order_index");

      if (eI) setMsg("❌ " + eI.message);

      const cleaned = (items || []).filter((it) => it.exercise_id);

      const withVarLabels = await attachVariationLabels(cleaned);
      setWorkoutItems(withVarLabels);
      await loadExerciseMeta(withVarLabels);
      await loadPreviousWorkoutSets(s);
    } else {
      setWorkoutItems([]);
      setMetaByExerciseId(new Map());
      setLastWorkoutSetMap(new Map());
    }

    const { data: performed, error: eP } = await supabase
      .from("sets")
      .select(
        "id, exercise_id, exercise_name, variation_id, set_index, weight, reps, created_at"
      )
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

  const completedExercisesCount = useMemo(() => {
    return workoutItems.reduce((acc, it) => {
      const key = makeKey(it.exercise_id, it.variation_id);
      const done = grouped.get(key) || [];
      const plannedCount = Array.isArray(it.set_targets) ? it.set_targets.length : 0;

      if (plannedCount > 0 && done.length >= plannedCount) {
        return acc + 1;
      }
      return acc;
    }, 0);
  }, [workoutItems, grouped]);

  const progressPct =
    totalPlannedSets > 0
      ? Math.min(100, Math.round((sets.length / totalPlannedSets) * 100))
      : 0;

  const isEnded = !!session?.ended_at;
  const elapsedLabel = formatElapsed(session?.started_at, session?.ended_at || nowTick);

  useEffect(() => {
    const validIds = new Set(workoutItems.map((it) => it.id));

    setOpenExerciseIds((prev) => {
      const next = new Set();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [workoutItems]);

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
    const current =
      idx >= 0 ? base[idx] : { set_index: setIndex, reps: null, weight: null };

    const next = {
      set_index: Number(setIndex),
      reps: patch.reps !== undefined ? patch.reps : current.reps ?? null,
      weight: patch.weight !== undefined ? patch.weight : current.weight ?? null,
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

  function hasLoggedDiffAgainstPlan(plannedTargets, loggedSets) {
    const plannedArr = sortTargets(plannedTargets);
    if (!plannedArr.length || !loggedSets.length) return false;

    return plannedArr.some((target) => {
      const setIndex = Number(target?.set_index) || 0;
      const logged = loggedSets.find((s) => Number(s?.set_index) === setIndex);
      if (!logged) return false;

      const plannedReps = target?.reps;
      const plannedWeight = target?.weight;
      const loggedReps = logged?.reps;
      const loggedWeight = logged?.weight;

      const repsChanged =
        plannedReps != null && loggedReps != null && Number(plannedReps) !== Number(loggedReps);
      const weightChanged =
        plannedWeight != null && loggedWeight != null && Number(plannedWeight) !== Number(loggedWeight);

      return repsChanged || weightChanged;
    });
  }

  async function logSetForExercise(exerciseId, variationId, weight, reps, options = {}) {
    const { startTimer = true, setIndexOverride = null } = options;
    setMsg("");

    if (isEnded) {
      setMsg("❌ Session already completed");
      return { ok: false };
    }

    const repsOk = isPosNum(reps);
    const weightOk = isNonNegNum(weight);
    if (!repsOk && !weightOk) {
      setMsg("❌ Enter reps and/or weight");
      return { ok: false };
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
      return { ok: false };
    }

    const key = makeKey(plan.exercise_id, plan.variation_id);
    const already = grouped.get(key) || [];
    const hasSetIndexOverride =
      setIndexOverride !== null &&
      setIndexOverride !== undefined &&
      Number.isFinite(Number(setIndexOverride)) &&
      Number(setIndexOverride) > 0;

    const nextIndex = hasSetIndexOverride
      ? Number(setIndexOverride)
      : already.length + 1;

    const plannedCount = Array.isArray(plan.set_targets) ? plan.set_targets.length : 0;

    if (plannedCount && nextIndex > plannedCount) {
      setMsg("❌ All planned sets for this exercise are already logged");
      return { ok: false };
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
      .select(
        "id, exercise_id, exercise_name, variation_id, set_index, weight, reps, created_at"
      )
      .single();

    setSaving(false);

    if (error) {
      setMsg("❌ " + error.message);
      return { ok: false };
    }

    setSets((prev) => [...prev, data]);

    const isFinalWorkoutSet = totalPlannedSets > 0 && sets.length + 1 >= totalPlannedSets;
    if (startTimer && !isFinalWorkoutSet) {
      startRestTimer(REST_TIMER_DEFAULT);
    }

    const plannedArr = sortTargets(plan.set_targets);
    const plannedTarget =
      plannedArr.find((t) => Number(t?.set_index) === Number(nextIndex)) || null;

    const logged = { reps: repsVal, weight: weightVal };
    const auto = shouldAutoUpdateMissingTarget(plannedTarget, logged);

    if (auto.ok) {
      const res = await updatePlanSetTargets(plan.id, nextIndex, auto.patch);
      if (!res.ok) console.warn("Auto update plan failed:", res.error);
    }

    const mergedLoggedSets = [...already, data];
    const hasPlanDiff = hasLoggedDiffAgainstPlan(plan.set_targets, mergedLoggedSets);

    return { ok: true, hasPlanDiff };
  }

  async function logRemainingAsPlanned(exercise) {
    if (!exercise || isEnded) return;

    const currentDone = grouped.get(makeKey(exercise.exercise_id, exercise.variation_id)) || [];
    const planned = sortTargets(exercise.set_targets);
    const nextIndex = currentDone.length + 1;
    const remaining = planned.filter((p) => Number(p?.set_index) >= nextIndex);

    if (!remaining.length) return;

    let allLogged = true;
    let hasPlanDiff = hasLoggedDiffAgainstPlan(exercise.set_targets, currentDone);

    for (let i = 0; i < remaining.length; i += 1) {
      const row = remaining[i];
      const isLast = i === remaining.length - 1;

      const result = await logSetForExercise(
        exercise.exercise_id,
        exercise.variation_id ?? null,
        row.weight != null ? String(row.weight) : "",
        row.reps != null ? String(row.reps) : "",
        {
          startTimer: isLast,
          setIndexOverride: Number(row.set_index),
        }
      );

      if (!result?.ok) {
        allLogged = false;
        break;
      }

      if (result?.hasPlanDiff) hasPlanDiff = true;
    }

    if (allLogged && !hasPlanDiff) {
      advanceToNextExercise(exercise.id);
    }
  }

  const openPlanUpdateModal = useCallback(
    (exercise, diffs) => {
      const title = exercise?.variation_label
        ? `${exercise.exercise_name} — ${exercise.variation_label}`
        : exercise.exercise_name || "Exercise";

      let modalId = null;

      modalId = openModal(
        <UpdatePlanModalContent
          exerciseTitle={title}
          diffs={diffs}
          saving={planModalSaving}
          onConfirm={async () => {
            setPlanModalSaving(true);

            for (const diff of diffs) {
              const res = await updatePlanSetTargets(exercise.id, diff.set_index, {
                reps: diff.loggedReps != null ? Number(diff.loggedReps) : undefined,
                weight: diff.loggedWeight != null ? Number(diff.loggedWeight) : undefined,
              });

              if (!res.ok) {
                setMsg("❌ Failed to update plan: " + res.error);
                setPlanModalSaving(false);
                return;
              }
            }

            setPlanModalSaving(false);
            closeModal(modalId);
            setMsg("✅ Plan updated for next time");
          }}
          onCancel={() => {
            closeModal(modalId);
          }}
        />,
        {
          closeOnBackdrop: true,
          closeOnEsc: true,
          overlayClassName: "app-modal-overlay--clear",
        }
      );
    },
    [openModal, closeModal, planModalSaving]
  );

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
    setRestOpen(false);
    setShowFinishOverlay(true);

    if (finishRedirectRef.current) window.clearTimeout(finishRedirectRef.current);
    finishRedirectRef.current = window.setTimeout(() => {
      navigate("/home");
    }, FINISH_REDIRECT_DELAY);
  }

  const openExerciseImage = useCallback(
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

  if (loading) return <SessionPageSkeleton />;

  const dateLabel =
    session?.session_date || dateISO
      ? new Date(session?.session_date || dateISO).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "N/A";

  const startedLabel = session?.started_at ? fmtLocal(session.started_at) : null;
  const headerChipText = isEnded
    ? `Completed ${fmtLocal(session.ended_at)}`
    : "Workout in Progress";

  return (
    <div className="session-page-root">
      <div className="session-page-shell session-content-ready">
        <header className="session-header-sticky-wrap">
          <div className="session-header-card">
            <div className="session-header-top-row">
              <div className="session-header-date">{dateLabel}</div>
              <div className={`session-header-chip ${isEnded ? "is-completed" : ""}`}>
                ● {headerChipText}
              </div>
            </div>

            <div className="session-header-title-row">
              <h2 className="session-header-title">{workoutName || "Workout Session"}</h2>
              <div className="session-header-inline-meta">{elapsedLabel}</div>
            </div>

            <div className="session-header-sub session-header-sub-secondary">
              <span>{workoutItems.length} exercises</span>
              <span>•</span>
              <span>
                {completedExercisesCount}/{workoutItems.length || 0} completed
              </span>
              <span>•</span>
              <span>
                {sets.length}/{totalPlannedSets || 0} sets
              </span>
              <span>•</span>
              <span>{progressPct}% done</span>
            </div>

            <div className="session-progress">
              <div className="session-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>

            {msg && <div className="session-inline-message">{msg}</div>}
            {!isEnded && !startedLabel && (
              <div className="session-inline-hint">
                The timer starts on your first logged set.
              </div>
            )}
          </div>
        </header>

        <section className="session-exercises-wrap" ref={exercisesWrapRef}>
          {workoutItems.length === 0 && (
            <div className="session-card">
              <p className="session-muted">No exercises in this workout.</p>
            </div>
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
                doneSets={done}
                lastSetMap={lastWorkoutSetMap}
                onLogSet={logSetForExercise}
                onLogRemainingAsPlanned={logRemainingAsPlanned}
                onOpenPlanUpdate={openPlanUpdateModal}
                onExerciseCompleted={advanceToNextExercise}
                isEnded={isEnded}
                isSaving={saving}
                onOpenImage={openExerciseImage}
                isOpen={openExerciseIds.has(it.id)}
                onToggle={() =>
                  setOpenExerciseIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(it.id)) next.delete(it.id);
                    else next.add(it.id);
                    return next;
                  })
                }
                registerCardRef={registerExerciseCardRef}
              />
            );
          })}

          <div className="session-finish-inline-wrap">
            <button
              className="session-finish-btn"
              onClick={finishSession}
              disabled={ending || isEnded}
            >
              {isEnded ? "Session completed" : ending ? "Finishing…" : "Finish Session"}
            </button>
          </div>

          <div className="session-scroll-bottom-space" />
        </section>
      </div>

      <RestTimer
        open={restOpen}
        seconds={restSeconds}
        baseSeconds={restBaseSeconds}
        isReady={restSeconds <= 0}
        onClose={closeRestTimer}
        onIncrease={() => {
          const next = restSeconds + REST_TIMER_STEP;
          setRestSeconds(next);
          setRestBaseSeconds(Math.max(restBaseSeconds, next));
        }}
        onDecrease={() => setRestSeconds((prev) => Math.max(0, prev - REST_TIMER_STEP))}
      />

      <FinishSuccessOverlay open={showFinishOverlay} />
    </div>
  );
}
