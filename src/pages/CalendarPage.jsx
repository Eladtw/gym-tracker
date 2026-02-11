// src/pages/CalendarPage.jsx
import "../css/calendar-theme.css";
import { useEffect, useMemo, useState, useCallback } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { Trash2 } from "lucide-react";

// הרחבת dayjs לשימוש ב־timezone (Asia/Jerusalem)
dayjs.extend(utc);
dayjs.extend(timezone);

function getTodayIL() {
  return dayjs().tz("Asia/Jerusalem").startOf("day");
}

// --- Tools לסטים ---
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

function summarizeTargets(setTargets) {
  const arr = normalizeTargets(setTargets);
  if (arr.length === 0) return "—";
  const repsArr = arr.map((s) => Number(s.reps) || 0);
  const wgtArr = arr.map((s) => Number(s.weight) || 0);
  const allRepsSame = repsArr.every((v) => v === repsArr[0]);
  const allWgtSame = wgtArr.every((v) => v === wgtArr[0]);

  if (allRepsSame && allWgtSame)
    return `${arr.length}×(${repsArr[0]} @ ${wgtArr[0]} kg)`;
  if (allRepsSame)
    return `${arr.length} sets · ${repsArr[0]} reps (varying weight)`;
  if (allWgtSame)
    return `${arr.length} sets · ${wgtArr[0]} kg (varying reps)`;
  return `${arr.length} sets (varying reps & weight)`;
}

function SetDetails({ setTargets }) {
  const rows = normalizeTargets(setTargets);
  return (
    <div className="set-details-box">
      <div className="set-details-title">Set Details:</div>
      {rows.map((s, i) => (
        <div key={i} className="set-row">
          <span>Set {s.set_index || i + 1}</span>
          <span>
            {s.reps ?? "-"} reps @ {s.weight ?? "-"} kg
          </span>
        </div>
      ))}
    </div>
  );
}

function uniquePrimaryGroupsFromItems(items) {
  const set = new Set();
  (items || []).forEach((it) => {
    const g = it?.primary_group_label;
    if (g) set.add(String(g));
  });
  return Array.from(set);
}

/* --------- WorkoutSelect – dropdown מותאם אישית --------- */
function WorkoutSelect({ workouts, value, onChange }) {
  const [open, setOpen] = useState(false);

  const selected = workouts.find((w) => String(w.id) === String(value));

  const handleSelect = (id) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="wk-select" tabIndex={0} onBlur={() => setOpen(false)}>
      <button
        type="button"
        className="wk-select-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{selected ? selected.name : "Choose a workout plan..."}</span>
        <span className="wk-select-arrow">▾</span>
      </button>

      {open && (
        <div className="wk-select-menu">
          {workouts.map((w) => (
            <div
              key={w.id}
              className={
                "wk-select-option" +
                (String(w.id) === String(value) ? " is-selected" : "")
              }
              onMouseDown={() => handleSelect(w.id)}
            >
              {w.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------- Planned list UI (PROFESSIONAL + ICONS) --------- */
function PlannedList({
  mode,
  date,
  plannedSessions = [],
  workouts = [],
  selectedPlanId,
  onSelectPlan,
  onDeletePlan,
}) {
  const isToday = mode === "today";
  const isFuture = mode === "future";

  const title = isToday
    ? "Planned for today"
    : isFuture
    ? "Planned for this day"
    : "Planned";

  const dateStr = dayjs(date).format("YYYY-MM-DD");

  return (
    <div className="calendar-modal-section">
      <div className="calendar-planned-header">
        <div className="calendar-label">{title}</div>

        {!!plannedSessions.length && (
          <div className="calendar-planned-count">
            {plannedSessions.length}{" "}
            {plannedSessions.length === 1 ? "workout" : "workouts"}
          </div>
        )}
      </div>

      {!plannedSessions.length && (
        <div className="calendar-planned-empty">
          <div className="calendar-planned-empty-title">No planned workouts</div>
          <div className="calendar-planned-empty-sub">
            Add a plan for this day to see it here.
          </div>
        </div>
      )}

      {!!plannedSessions.length && (
        <div className="calendar-planned-list">
          {plannedSessions.map((ps) => {
            const w = workouts.find((x) => String(x.id) === String(ps.workout_id));
            const name = w?.name || "Workout";
            const isActive = String(selectedPlanId) === String(ps.id);

            const clickable = isToday || isFuture;

            return (
              <div
                key={ps.id}
                className={
                  "calendar-planned-card" +
                  (isActive ? " is-active" : "") +
                  (isToday ? " is-today-mode" : "") +
                  (isFuture ? " is-future-mode" : "")
                }
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onSelectPlan(ps.id) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => e.key === "Enter" && onSelectPlan(ps.id)
                    : undefined
                }
              >
                <span
                  className={
                    "calendar-planned-accent" +
                    (isToday ? " accent-today" : " accent-planned")
                  }
                  aria-hidden="true"
                />

                <div className="calendar-planned-left">
                  {isToday && (
                    <input
                      className="calendar-planned-radio"
                      type="radio"
                      name="planned-pick"
                      checked={isActive}
                      onChange={() => onSelectPlan(ps.id)}
                      aria-label={`Select planned workout: ${name}`}
                    />
                  )}

                  <div className="calendar-planned-text">
                    <div className="calendar-planned-name">{name}</div>
                    <div className="calendar-planned-sub">{dateStr}</div>
                  </div>
                </div>

                {isFuture && (
                  <button
                    type="button"
                    className="calendar-planned-delete-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePlan(ps.id);
                    }}
                    title="Delete planned workout"
                    aria-label={`Delete planned workout: ${name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------- Modal של בחירת אימון (היום / עתיד) --------- */
function WorkoutSelectorModal({
  mode, // "today" | "future"
  date,
  workouts,
  chosenWorkoutId,
  onChooseWorkout,
  chosenWorkoutItems,

  plannedSessions,
  selectedPlanSessionId,
  onSelectPlanSession,
  onDeletePlanSession,

  onPrimaryAction,
  msg,
  onClose,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const dateTitle = date.format("dddd, MMMM D, YYYY");
  const isFuture = mode === "future";
  const isToday = mode === "today";

  const hasPlanned = plannedSessions.length > 0;

  const isDisabled = isToday
    ? hasPlanned
      ? !selectedPlanSessionId && !chosenWorkoutId
      : !chosenWorkoutId
    : !chosenWorkoutId;

  const title = isFuture ? "Plan workouts for this day" : "Start workout";
  const subtitle = isFuture
    ? "You can schedule more than one workout for the same date."
    : hasPlanned
    ? "You have planned workouts for today. Choose which one to start."
    : "Choose a workout plan to start today.";

  const buttonLabel = isFuture
    ? "Add Planned Workout"
    : hasPlanned
    ? selectedPlanSessionId
      ? "▶ Start Selected Planned Workout"
      : chosenWorkoutId
      ? "▶ Start Selected Workout"
      : "Select a planned workout"
    : "▶ Start Workout";

  const selectedWorkout = workouts.find(
    (w) => String(w.id) === String(chosenWorkoutId)
  );
  const workoutName = selectedWorkout?.name || "Workout";

  // ✅ Workout muscle groups = all unique PRIMARY groups in the workout
  const workoutMuscles = useMemo(() => {
    const unique = uniquePrimaryGroupsFromItems(chosenWorkoutItems);
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }, [chosenWorkoutItems]);

  const hasPlannedForFuture = isFuture && plannedSessions.length > 0;

  return (
    <div className="calendar-modal-overlay">
      <div className="calendar-modal-panel">
        <div className="calendar-modal-header">
          <div className="calendar-modal-toprow">
            <div className="calendar-modal-date">{dateTitle}</div>
            <button className="calendar-modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="calendar-modal-title">{title}</div>
          <div className="calendar-modal-subtitle">{subtitle}</div>
        </div>

        {(isToday || hasPlannedForFuture) && (
          <PlannedList
            mode={mode}
            date={date}
            plannedSessions={plannedSessions}
            workouts={workouts}
            selectedPlanId={selectedPlanSessionId}
            onSelectPlan={(id) => onSelectPlanSession(id)}
            onDeletePlan={(id) => onDeletePlanSession(id)}
          />
        )}

        <div className="calendar-modal-section">
          <div className="calendar-label">
            {isFuture ? "Add another plan" : "Workout Plan"}
          </div>
          <WorkoutSelect
            workouts={workouts}
            value={chosenWorkoutId}
            onChange={onChooseWorkout}
          />
          {isToday && hasPlanned && (
            <div className="calendar-hint">
              You can also start a non-planned workout by selecting a plan here.
            </div>
          )}
        </div>

        <div className="calendar-exercises-container">
          {!chosenWorkoutId && (
            <p className="calendar-empty-hint">
              Select a workout plan to view exercises
            </p>
          )}

          {chosenWorkoutId && (
            <>
              {/* ✅ Workout header + muscle groups */}
              <div className="calendar-workout-overview">
                <div className="calendar-workout-name">{workoutName}</div>
                <div className="calendar-workout-muscles">
                  {workoutMuscles.length > 0 ? (
                    workoutMuscles.map((m) => (
                      <span key={m} className="muscle-chip">
                        {m}
                      </span>
                    ))
                  ) : (
                    <span className="calendar-workout-muscles-empty">
                      No muscle groups found (check primary_subgroup_id in DB)
                    </span>
                  )}
                </div>
              </div>

              <div className="calendar-exercises-count">
                {chosenWorkoutItems.length}{" "}
                {chosenWorkoutItems.length === 1 ? "exercise" : "exercises"}
              </div>

              {chosenWorkoutItems.map((it) => {
                const summary = summarizeTargets(it.set_targets);
                const isOpen = expandedId === it.id;

                // ✅ Group of primary muscle, then primary muscle subgroup
                const groupLabel = it?.primary_group_label || "Unknown";
                const primarySubLabel = it?.primary_subgroup_label || "Unknown";

                return (
                  <div key={it.id} className="exercise-card">
                    <div
                      className="exercise-header"
                      onClick={() =>
                        setExpandedId((prev) => (prev === it.id ? null : it.id))
                      }
                    >
                      <div>
                        <div className="exercise-title">{it.exercise_name}</div>
                        <div className="exercise-summary">{summary}</div>
                      </div>
                      <div className="exercise-chevron">{isOpen ? "▴" : "▾"}</div>
                    </div>

                    {/* ✅ Show: Group • Primary Subgroup (chips) */}
                    <div className="exercise-tag-row">
                      <span
                        className={
                          "exercise-tag" +
                          (groupLabel === "Unknown" ? " is-unknown" : "")
                        }
                      >
                        {groupLabel}
                      </span>
                      <span
                        className={
                          "exercise-tag" +
                          (primarySubLabel === "Unknown" ? " is-unknown" : "")
                        }
                      >
                        {primarySubLabel}
                      </span>
                    </div>

                    {isOpen && <SetDetails setTargets={it.set_targets} />}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="calendar-modal-footer">
          <button
            className={"calendar-start-btn" + (isDisabled ? " is-disabled" : "")}
            disabled={isDisabled}
            onClick={!isDisabled ? onPrimaryAction : undefined}
          >
            {buttonLabel}
          </button>

          {msg && <div className="calendar-error-msg">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

/* --------- Modal לצפייה באימונים ביום עבר --------- */
function DaySessionsModal({ date, sessions, workouts, loading, onClose }) {
  const dateTitle = date.format("dddd, MMMM D, YYYY");
  const hasSessions = sessions && sessions.length > 0;

  return (
    <div className="calendar-modal-overlay">
      <div className="calendar-modal-panel">
        <div className="calendar-modal-header">
          <div className="calendar-modal-toprow">
            <div className="calendar-modal-date">{dateTitle}</div>
            <button className="calendar-modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="calendar-modal-title">Completed workouts</div>
          <div className="calendar-modal-subtitle">
            {hasSessions
              ? "These are the workouts you logged on this day."
              : "No workouts were logged on this day."}
          </div>
        </div>

        <div className="calendar-exercises-container">
          {loading && <p className="calendar-empty-hint">Loading workouts…</p>}

          {!loading && !hasSessions && (
            <p className="calendar-empty-hint">
              Nothing here yet. You didn&apos;t log a workout on this date.
            </p>
          )}

          {!loading && hasSessions && (
            <ul className="calendar-session-list">
              {sessions.map((s) => {
                const w = workouts.find((w) => w.id === s.workout_id);
                return (
                  <li key={s.id} className="calendar-session-item">
                    <div className="calendar-session-name">
                      {w?.name || "Workout"}
                    </div>
                    <div className="calendar-session-meta">
                      {s.ended_at ? "Completed" : "Logged"}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// --- דף ראשי ---
export default function CalendarPage() {
  const todayIL = useMemo(() => getTodayIL(), []);
  const [month, setMonth] = useState(() => todayIL.startOf("month"));
  const [selectedDate, setSelectedDate] = useState(null);

  // activeModal: null | "today" | "future" | "past"
  const [activeModal, setActiveModal] = useState(null);

  const [workouts, setWorkouts] = useState([]);
  const [chosenWorkoutId, setChosenWorkoutId] = useState("");
  const [chosenWorkoutItems, setChosenWorkoutItems] = useState([]);

  // plannedByDate: dateStr -> array of planned sessions
  const [plannedByDate, setPlannedByDate] = useState(new Map());
  const [completedCountByDate, setCompletedCountByDate] = useState(new Map());

  // state for selected day's plans
  const [plannedForSelectedDate, setPlannedForSelectedDate] = useState([]);
  const [selectedPlanSessionId, setSelectedPlanSessionId] = useState(null);

  const [daySessions, setDaySessions] = useState([]);
  const [daySessionsLoading, setDaySessionsLoading] = useState(false);

  const [msg, setMsg] = useState("");

  const navigate = useNavigate();

  // ✅ Lock body scroll when modal is open (fix mobile scroll + overscroll)
  useEffect(() => {
    const isOpen = !!activeModal;
    const body = document.body;

    if (isOpen) {
      body.classList.add("calendar-modal-open");
    } else {
      body.classList.remove("calendar-modal-open");
    }

    return () => {
      body.classList.remove("calendar-modal-open");
    };
  }, [activeModal]);

  // טען אימונים
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("id, name, created_at")
        .order("created_at", { ascending: false });

      if (error) setMsg("❌ " + error.message);
      else setWorkouts(data || []);
    })();
  }, []);

  // טען sessions לחודש:
  // Planned = started_at is null
  // Completed = ended_at not null
  const loadMonthSessions = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return;

    const start = month.startOf("month").format("YYYY-MM-DD");
    const end = month.endOf("month").format("YYYY-MM-DD");

    const { data, error } = await supabase
      .from("sessions")
      .select("id, user_id, workout_id, session_date, started_at, ended_at")
      .eq("user_id", uid)
      .gte("session_date", start)
      .lte("session_date", end);

    if (error) {
      console.error("Failed to load month sessions", error);
      return;
    }

    const plannedMap = new Map();
    const completedMap = new Map();

    (data || []).forEach((r) => {
      const dateKey = r.session_date;

      if (!r.started_at) {
        const arr = plannedMap.get(dateKey) || [];
        arr.push(r);
        plannedMap.set(dateKey, arr);
      }

      if (r.ended_at) {
        completedMap.set(dateKey, (completedMap.get(dateKey) || 0) + 1);
      }
    });

    for (const [k, arr] of plannedMap.entries()) {
      plannedMap.set(
        k,
        [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id)))
      );
    }

    setPlannedByDate(plannedMap);
    setCompletedCountByDate(completedMap);
  }, [month]);

  useEffect(() => {
    loadMonthSessions();
  }, [loadMonthSessions]);

  async function loadPlannedForDate(dateStr) {
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return [];

    const { data, error } = await supabase
      .from("sessions")
      .select("id, user_id, workout_id, session_date, started_at, ended_at")
      .eq("user_id", uid)
      .eq("session_date", dateStr)
      .is("started_at", null)
      .order("id", { ascending: true });

    if (error) {
      console.error("Failed to load planned for date", error);
      return [];
    }

    return data || [];
  }

  function refreshMonthSessions() {
    loadMonthSessions();
  }

  // בניית גריד תאריכים
  const days = useMemo(() => {
    const start = month.startOf("month");
    const end = month.endOf("month");
    const startGrid = start.startOf("week");
    const endGrid = end.endOf("week");
    const arr = [];
    let cur = startGrid;
    while (cur.isBefore(endGrid) || cur.isSame(endGrid, "day")) {
      arr.push(cur);
      cur = cur.add(1, "day");
    }
    return arr;
  }, [month]);

  // ✅ Load exercises + show: Primary Group + Primary Subgroup
  // Source of truth for PRIMARY is exercises_catalog.primary_subgroup_id
  useEffect(() => {
    if (!chosenWorkoutId) {
      setChosenWorkoutItems([]);
      return;
    }

    (async () => {
      setMsg("");

      const { data: wex, error: wexErr } = await supabase
        .from("workout_exercises")
        .select("id, exercise_name, exercise_id, set_targets, order_index")
        .eq("workout_id", chosenWorkoutId)
        .order("order_index");

      if (wexErr) {
        console.error("workout_exercises load error:", wexErr);
        setMsg("❌ " + wexErr.message);
        setChosenWorkoutItems([]);
        return;
      }

      const rows = wex || [];

      const exerciseIds = Array.from(
        new Set(rows.map((r) => r.exercise_id).filter(Boolean))
      );

      // Maps
      const exerciseIdToPrimarySubId = new Map(); // exercise_id -> primary_subgroup_id
      const primarySubIdToObj = new Map(); // subgroup_id -> {label, group_id}
      const groupIdToLabel = new Map(); // group_id -> label

      if (exerciseIds.length > 0) {
        // 1) exercises_catalog -> primary_subgroup_id
        const { data: exMeta, error: exErr } = await supabase
          .from("exercises_catalog")
          .select("id, primary_subgroup_id")
          .in("id", exerciseIds);

        if (exErr) {
          console.error("exercises_catalog meta error:", exErr);
        } else {
          (exMeta || []).forEach((e) => {
            if (e?.id) exerciseIdToPrimarySubId.set(e.id, e.primary_subgroup_id);
          });

          const primarySubIds = Array.from(
            new Set(
              (exMeta || []).map((e) => e.primary_subgroup_id).filter(Boolean)
            )
          );

          // 2) muscle_subgroups -> label + group_id
          if (primarySubIds.length > 0) {
            const { data: subs, error: subErr } = await supabase
              .from("muscle_subgroups")
              .select("id, label, group_id")
              .in("id", primarySubIds);

            if (subErr) {
              console.error("muscle_subgroups error:", subErr);
            } else {
              (subs || []).forEach((sg) => {
                if (sg?.id) primarySubIdToObj.set(sg.id, sg);
              });

              const groupIds = Array.from(
                new Set((subs || []).map((sg) => sg.group_id).filter(Boolean))
              );

              // 3) muscle_groups -> label
              if (groupIds.length > 0) {
                const { data: groups, error: gErr } = await supabase
                  .from("muscle_groups")
                  .select("id, label")
                  .in("id", groupIds);

                if (gErr) {
                  console.error("muscle_groups error:", gErr);
                } else {
                  (groups || []).forEach((g) => {
                    if (g?.id) groupIdToLabel.set(g.id, g.label);
                  });
                }
              }
            }
          }
        }
      }

      const merged = rows.map((r) => {
        const exId = r.exercise_id || null;
        const primarySubId = exId ? exerciseIdToPrimarySubId.get(exId) : null;
        const subObj = primarySubId ? primarySubIdToObj.get(primarySubId) : null;
        const groupLabel = subObj?.group_id
          ? groupIdToLabel.get(subObj.group_id)
          : null;

        return {
          ...r,
          primary_subgroup_id: primarySubId || null,
          primary_subgroup_label: subObj?.label || null,
          primary_group_label: groupLabel || null,
        };
      });

      setChosenWorkoutItems(merged);
    })();
  }, [chosenWorkoutId]);

  // טעינת Sessions ליום עבר
  async function loadDaySessions(date) {
    setDaySessionsLoading(true);
    setDaySessions([]);

    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) {
      setDaySessionsLoading(false);
      return;
    }

    const dateStr = date.format("YYYY-MM-DD");

    const { data, error } = await supabase
      .from("sessions")
      .select("id, workout_id, session_date, started_at, ended_at")
      .eq("user_id", uid)
      .eq("session_date", dateStr)
      .order("id", { ascending: true });

    if (error) console.error("Failed to load sessions for date", error);

    const completedOnly = (data || []).filter((r) => r.ended_at);
    setDaySessions(completedOnly);
    setDaySessionsLoading(false);
  }

  // ---------- Start for TODAY ----------
  async function startSessionForDate() {
    if (!selectedDate) return setMsg("Pick a date");

    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return setMsg("Not logged in");

    const dateStr = selectedDate.format("YYYY-MM-DD");

    if (selectedPlanSessionId) {
      const { data: planRow, error: pReadErr } = await supabase
        .from("sessions")
        .select("id, started_at")
        .eq("id", selectedPlanSessionId)
        .eq("user_id", uid)
        .single();

      if (pReadErr || !planRow) {
        setMsg("❌ Could not load the planned workout.");
        return;
      }

      if (planRow.started_at) {
        refreshMonthSessions();
        return navigate(`/session/${planRow.id}`);
      }

      const { error: upErr } = await supabase
        .from("sessions")
        .update({ started_at: new Date().toISOString() })
        .eq("id", planRow.id);

      if (upErr) {
        setMsg("❌ " + upErr.message);
        return;
      }

      refreshMonthSessions();
      const freshPlanned = await loadPlannedForDate(dateStr);
      setPlannedForSelectedDate(freshPlanned);

      return navigate(`/session/${planRow.id}`);
    }

    if (!chosenWorkoutId) return setMsg("Pick a workout");

    const { data: existing, error: eErr } = await supabase
      .from("sessions")
      .select("id")
      .eq("user_id", uid)
      .eq("workout_id", chosenWorkoutId)
      .eq("session_date", dateStr)
      .limit(1);

    if (eErr) {
      setMsg("❌ " + eErr.message);
      return;
    }

    if (existing && existing.length > 0) {
      refreshMonthSessions();
      return navigate(`/session/${existing[0].id}`);
    }

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        user_id: uid,
        workout_id: chosenWorkoutId,
        session_date: dateStr,
        started_at: new Date().toISOString(),
        ended_at: null,
      })
      .select("id")
      .single();

    if (error) {
      setMsg("❌ " + error.message);
      return;
    }

    refreshMonthSessions();
    const freshPlanned = await loadPlannedForDate(dateStr);
    setPlannedForSelectedDate(freshPlanned);

    navigate(`/session/${data.id}`);
  }

  // ---------- Plan for FUTURE ----------
  async function planSessionForDate() {
    if (!selectedDate) return setMsg("Pick a date");
    if (!chosenWorkoutId) return setMsg("Pick a workout");

    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return setMsg("Not logged in");

    const dateStr = selectedDate.format("YYYY-MM-DD");

    const { data: dup, error: dErr } = await supabase
      .from("sessions")
      .select("id")
      .eq("user_id", uid)
      .eq("session_date", dateStr)
      .eq("workout_id", chosenWorkoutId)
      .is("started_at", null)
      .limit(1);

    if (dErr) {
      setMsg("❌ " + dErr.message);
      return;
    }

    if (dup && dup.length > 0) {
      setMsg("Workout already planned for this day.");
      return;
    }

    const { error } = await supabase.from("sessions").insert({
      user_id: uid,
      workout_id: chosenWorkoutId,
      session_date: dateStr,
      started_at: null,
      ended_at: null,
    });

    if (error) {
      setMsg("❌ " + error.message);
      return;
    }

    refreshMonthSessions();

    const freshPlanned = await loadPlannedForDate(dateStr);
    setPlannedForSelectedDate(freshPlanned);

    setMsg("✅ Workout planned for this day");
  }

  // ---------- Delete a specific planned session ----------
  async function deletePlanById(planId) {
    if (!planId) return;

    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return;

    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", planId)
      .eq("user_id", uid)
      .is("started_at", null);

    if (error) {
      setMsg("❌ " + error.message);
      return;
    }

    if (String(selectedPlanSessionId) === String(planId)) {
      setSelectedPlanSessionId(null);
    }

    const dateStr = selectedDate?.format("YYYY-MM-DD");
    if (dateStr) {
      const freshPlanned = await loadPlannedForDate(dateStr);
      setPlannedForSelectedDate(freshPlanned);
    }

    refreshMonthSessions();
    setMsg("✅ Plan deleted");
  }

  // ---------- Day click ----------
  async function handleDayClick(d) {
    setSelectedDate(d);
    setMsg("");
    setChosenWorkoutItems([]);
    setChosenWorkoutId("");
    setSelectedPlanSessionId(null);

    const isPast = d.isBefore(todayIL, "day");
    const isToday = d.isSame(todayIL, "day");
    const mode = isPast ? "past" : isToday ? "today" : "future";
    setActiveModal(mode);

    const dateKey = d.format("YYYY-MM-DD");

    const plannedArr = plannedByDate.get(dateKey) || [];
    setPlannedForSelectedDate(plannedArr);

    if (plannedArr.length === 1) {
      setSelectedPlanSessionId(plannedArr[0].id);
      setChosenWorkoutId(plannedArr[0].workout_id || "");
    }

    if (isPast) {
      loadDaySessions(d);
    }
  }

  function handleClosePanel() {
    setActiveModal(null);
  }

  const summaryDate = selectedDate || todayIL;
  const summaryKey = summaryDate.format("YYYY-MM-DD");
  const plannedCount = (plannedByDate.get(summaryKey) || []).length;
  const completedCount = completedCountByDate.get(summaryKey) || 0;

  let summaryText;
  if (summaryDate.isBefore(todayIL, "day")) {
    summaryText =
      completedCount === 0
        ? "No completed workout on this day"
        : completedCount === 1
        ? "1 completed workout on this day"
        : `${completedCount} completed workouts on this day`;
  } else {
    summaryText =
      plannedCount === 0
        ? "No workout planned for this day"
        : plannedCount === 1
        ? "You have 1 planned workout on this day"
        : `You have ${plannedCount} planned workouts on this day`;
  }

  return (
    <>
      <div className="calendar-page-shell">
        <div className="calendar-scope calendar-wrap">
          <header className="calendar-main-header">
            <h1 className="calendar-main-title">Today&apos;s plan</h1>
          </header>

          <div className="calendar-header-row">
            <button
              className="calendar-nav-btn"
              aria-label="Previous month"
              onClick={() => setMonth((m) => m.subtract(1, "month"))}
            >
              ◀
            </button>
            <h2 className="calendar-title">{month.format("MMMM YYYY")}</h2>
            <button
              className="calendar-nav-btn"
              aria-label="Next month"
              onClick={() => setMonth((m) => m.add(1, "month"))}
            >
              ▶
            </button>
          </div>

          <div className="calendar-grid-7 calendar-weekdays-row">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="weekday-header">
                {d}
              </div>
            ))}
          </div>

          <div className="calendar-grid-7 calendar-days-grid">
            {days.map((d) => {
              const isCur = d.month() === month.month();
              const isToday = d.isSame(todayIL, "day");
              const isSelected = selectedDate && d.isSame(selectedDate, "day");

              const isPastDay = d.isBefore(todayIL, "day");
              const isFutureDay = d.isAfter(todayIL, "day");

              const key = d.format("YYYY-MM-DD");

              const plannedArr = plannedByDate.get(key) || [];
              const plannedCountCell = plannedArr.length;

              const completedCountCell = completedCountByDate.get(key) || 0;
              const hasCompleted = completedCountCell > 0;

              const hasAnyWorkout = plannedCountCell > 0 || hasCompleted;

              const firstPlannedWorkoutName =
                plannedCountCell > 0
                  ? workouts.find(
                      (w) => String(w.id) === String(plannedArr[0].workout_id)
                    )?.name
                  : null;

              return (
                <div
                  key={key}
                  className={
                    "day-cell" +
                    (isCur ? " is-current" : " is-outside") +
                    (isToday ? " is-today" : "") +
                    (plannedCountCell > 0 ? " has-planned" : "") +
                    (hasCompleted ? " has-completed" : "") +
                    (isSelected ? " is-selected" : "") +
                    (hasAnyWorkout && isToday ? " workout-today" : "") +
                    (hasAnyWorkout && isFutureDay ? " workout-future" : "") +
                    (hasAnyWorkout && isPastDay ? " workout-past" : "")
                  }
                  onClick={() => handleDayClick(d)}
                  title={
                    plannedCountCell > 0
                      ? `Planned: ${plannedCountCell}`
                      : hasCompleted
                      ? `${completedCountCell} completed`
                      : ""
                  }
                >
                  <div className="day-cell-top">
                    <span className="day-number">{d.date()}</span>

                    {hasCompleted && (
                      <span className="day-session-dot day-session-dot--completed">
                        ● {completedCountCell}
                      </span>
                    )}

                    {!hasCompleted && plannedCountCell > 0 && (
                      <span className="day-session-dot day-session-dot--planned">
                        ● {plannedCountCell}
                      </span>
                    )}
                  </div>

                  {plannedCountCell > 0 && firstPlannedWorkoutName && (
                    <div className="day-planned-name">
                      {firstPlannedWorkoutName}
                      {plannedCountCell > 1 ? ` +${plannedCountCell - 1}` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="calendar-day-summary">{summaryText}</div>

          <div className="calendar-legend">
            <div className="calendar-legend-item">
              <span className="calendar-legend-swatch calendar-legend-swatch--workout-today" />
              <span className="calendar-legend-text">Today</span>
            </div>

            <div className="calendar-legend-item">
              <span className="calendar-legend-swatch calendar-legend-swatch--workout-future" />
              <span className="calendar-legend-text">Future workout day</span>
            </div>

            <div className="calendar-legend-item">
              <span className="calendar-legend-swatch calendar-legend-swatch--workout-past" />
              <span className="calendar-legend-text">Past workout day</span>
            </div>
          </div>
        </div>
      </div>

      {selectedDate && (activeModal === "today" || activeModal === "future") && (
        <WorkoutSelectorModal
          mode={activeModal}
          date={selectedDate}
          workouts={workouts}
          chosenWorkoutId={chosenWorkoutId}
          onChooseWorkout={(id) => {
            setChosenWorkoutId(id);
            setMsg("");
            setSelectedPlanSessionId(null);
          }}
          chosenWorkoutItems={chosenWorkoutItems}
          plannedSessions={plannedForSelectedDate}
          selectedPlanSessionId={selectedPlanSessionId}
          onSelectPlanSession={(planId) => {
            setSelectedPlanSessionId(planId);
            setMsg("");
            const plan = (plannedForSelectedDate || []).find(
              (p) => String(p.id) === String(planId)
            );
            if (plan?.workout_id) setChosenWorkoutId(plan.workout_id);
          }}
          onDeletePlanSession={deletePlanById}
          onPrimaryAction={
            activeModal === "today" ? startSessionForDate : planSessionForDate
          }
          msg={msg}
          onClose={handleClosePanel}
        />
      )}

      {selectedDate && activeModal === "past" && (
        <DaySessionsModal
          date={selectedDate}
          sessions={daySessions}
          workouts={workouts}
          loading={daySessionsLoading}
          onClose={handleClosePanel}
        />
      )}
    </>
  );
}
