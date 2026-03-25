import { supabase } from "../lib/supabaseClient";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatShortDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

function formatLongDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return "--";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "--";
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function normalizeExerciseKey(row) {
  if (row.exercise_id) return `id:${row.exercise_id}`;
  return `name:${String(row.exercise_name || "unknown").toLowerCase()}`;
}

function getGroupLabel(row) {
  return (
    row?.exercises_catalog?.muscle_subgroups?.muscle_groups?.label ||
    row?.exercises_catalog?.muscle_subgroups?.label ||
    null
  );
}

function getSubGroupLabel(row) {
  return row?.exercises_catalog?.muscle_subgroups?.label || null;
}

function aggregateSessionSets(rows) {
  const byExercise = new Map();
  let totalVolume = 0;

  for (const row of rows || []) {
    const key = normalizeExerciseKey(row);
    const weight = safeNum(row.weight);
    const reps = safeNum(row.reps);
    const volume = weight * reps;
    totalVolume += volume;

    if (!byExercise.has(key)) {
      byExercise.set(key, {
        key,
        exerciseName: row.exercise_name || row?.exercises_catalog?.name || "Exercise",
        groupLabel: getGroupLabel(row),
        subGroupLabel: getSubGroupLabel(row),
        sets: [],
      });
    }

    byExercise.get(key).sets.push({
      setIndex: safeNum(row.set_index) || 1,
      weight,
      reps,
    });
  }

  const exercises = [...byExercise.values()].map((exercise) => {
    const sets = [...exercise.sets].sort((a, b) => a.setIndex - b.setIndex);
    const bestWeight = sets.reduce((max, s) => Math.max(max, s.weight), 0);
    const bestReps = sets.reduce((max, s) => Math.max(max, s.reps), 0);
    const totalExerciseVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    return {
      ...exercise,
      sets,
      setCount: sets.length,
      bestWeight,
      bestReps,
      totalExerciseVolume,
    };
  });

  const muscleGroups = Array.from(
    new Set(exercises.map((ex) => ex.groupLabel).filter(Boolean))
  );

  return {
    exercises,
    exercisesCount: exercises.length,
    setsCount: (rows || []).length,
    muscleGroups,
    totalVolume,
  };
}

function summarizeVsPrevious(current, previous) {
  const prevByKey = new Map((previous?.exercises || []).map((x) => [x.key, x]));

  const improvements = (current?.exercises || [])
    .map((exercise) => {
      const prev = prevByKey.get(exercise.key);
      const prevBestWeight = prev?.bestWeight || 0;
      const prevBestReps = prev?.bestReps || 0;
      const prevVolume = prev?.totalExerciseVolume || 0;

      const deltaWeight = exercise.bestWeight - prevBestWeight;
      const deltaReps = exercise.bestReps - prevBestReps;
      const deltaVolume = exercise.totalExerciseVolume - prevVolume;

      const rows = exercise.sets.map((set) => {
        const prevSet = prev?.sets?.find((p) => p.setIndex === set.setIndex);
        const deltaW = set.weight - safeNum(prevSet?.weight);
        const deltaR = set.reps - safeNum(prevSet?.reps);
        return {
          set: set.setIndex,
          prev: `${safeNum(prevSet?.reps)} x ${safeNum(prevSet?.weight)}`,
          current: `${set.reps} x ${set.weight}`,
          deltaWeight: deltaW,
          deltaReps: deltaR,
        };
      });

      return {
        key: exercise.key,
        name: exercise.exerciseName,
        group: exercise.groupLabel || "General",
        area: exercise.subGroupLabel
          ? `${exercise.groupLabel || "General"} > ${exercise.subGroupLabel}`
          : exercise.groupLabel || "General",
        bestWeight: exercise.bestWeight,
        bestReps: exercise.bestReps,
        totalVolume: exercise.totalExerciseVolume,
        deltaWeight,
        deltaReps,
        deltaVolume,
        rows,
      };
    })
    .sort((a, b) => b.deltaWeight - a.deltaWeight);

  return improvements;
}

async function getCurrentUserId() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user?.id || null;
}

async function fetchSetsForSessionIds(sessionIds) {
  if (!sessionIds?.length) return [];

  const { data, error } = await supabase
    .from("sets")
    .select(
      `
      id,
      session_id,
      exercise_id,
      exercise_name,
      set_index,
      weight,
      reps,
      exercises_catalog (
        name,
        primary_subgroup_id,
        muscle_subgroups:primary_subgroup_id (
          label,
          muscle_groups (
            label
          )
        )
      )
    `
    )
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchWorkoutHistoryList(limit = 20) {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error("Not logged in");

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select(
      `
      id,
      workout_id,
      session_date,
      started_at,
      ended_at,
      workouts ( name )
    `
    )
    .eq("user_id", uid)
    .not("ended_at", "is", null)
    .order("session_date", { ascending: false })
    .order("ended_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const sessionRows = sessions || [];
  const sessionIds = sessionRows.map((s) => s.id);
  const setRows = await fetchSetsForSessionIds(sessionIds);
  const setsBySession = new Map();
  setRows.forEach((row) => {
    if (!setsBySession.has(row.session_id)) setsBySession.set(row.session_id, []);
    setsBySession.get(row.session_id).push(row);
  });

  const sameWorkoutOlder = new Map();
  for (let i = 0; i < sessionRows.length; i += 1) {
    const s = sessionRows[i];
    const older = sessionRows.slice(i + 1).find((x) => x.workout_id === s.workout_id);
    if (older) sameWorkoutOlder.set(s.id, older.id);
  }

  const aggregates = new Map();
  for (const s of sessionRows) {
    aggregates.set(s.id, aggregateSessionSets(setsBySession.get(s.id) || []));
  }

  return sessionRows.map((s) => {
    const agg = aggregates.get(s.id) || aggregateSessionSets([]);
    const prev = sameWorkoutOlder.get(s.id)
      ? aggregates.get(sameWorkoutOlder.get(s.id))
      : null;

    const delta = agg.totalVolume - safeNum(prev?.totalVolume);
    const threshold = safeNum(prev?.totalVolume) * 0.02;
    let status = "Maintained";
    let statusTone = "neutral";
    if (delta > threshold) {
      status = "Improved";
      statusTone = "positive";
    } else if (delta < -threshold) {
      status = "Declined";
      statusTone = "negative";
    }

    return {
      id: s.id,
      name: s?.workouts?.name || "Workout",
      dateLabel: formatShortDate(s.session_date || s.ended_at),
      status,
      statusTone,
      muscleGroups: agg.muscleGroups.slice(0, 3),
      exercisesCount: agg.exercisesCount,
      setsCount: agg.setsCount,
      duration: formatDuration(s.started_at, s.ended_at),
      totalVolume: agg.totalVolume,
    };
  });
}

export async function fetchWorkoutHistorySession(historyId) {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error("Not logged in");

  const { data: session, error } = await supabase
    .from("sessions")
    .select(
      `
      id,
      workout_id,
      session_date,
      started_at,
      ended_at,
      workouts ( name )
    `
    )
    .eq("id", historyId)
    .eq("user_id", uid)
    .single();

  if (error) throw error;

  const { data: previousSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", uid)
    .eq("workout_id", session.workout_id)
    .not("ended_at", "is", null)
    .lt("ended_at", session.ended_at)
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sessionIds = [session.id, previousSession?.id].filter(Boolean);
  const rows = await fetchSetsForSessionIds(sessionIds);

  const currentRows = rows.filter((r) => r.session_id === session.id);
  const previousRows = rows.filter((r) => r.session_id === previousSession?.id);

  const currentAgg = aggregateSessionSets(currentRows);
  const previousAgg = aggregateSessionSets(previousRows);
  const improvements = summarizeVsPrevious(currentAgg, previousAgg);

  const summary = {
    totalExercises: currentAgg.exercisesCount,
    totalExercisesDelta: currentAgg.exercisesCount - previousAgg.exercisesCount,
    totalVolume: Math.round(currentAgg.totalVolume),
    totalVolumeDelta: Math.round(currentAgg.totalVolume - previousAgg.totalVolume),
  };

  return {
    id: session.id,
    title: session?.workouts?.name || "Workout",
    subtitle: `${formatLongDate(session.session_date || session.ended_at)} • ${formatDuration(
      session.started_at,
      session.ended_at
    )}`,
    muscles: currentAgg.muscleGroups,
    summary,
    topImprovements: improvements.slice(0, 3),
    allImprovements: improvements,
    workoutLog: currentAgg.exercises.map((exercise) => {
      const previousExercise = previousAgg.exercises.find((x) => x.key === exercise.key);
      return {
        id: exercise.key,
        name: exercise.exerciseName,
        area: exercise.subGroupLabel
          ? `${exercise.groupLabel || "General"} > ${exercise.subGroupLabel}`
          : exercise.groupLabel || "General",
        setsLabel: `${exercise.setCount} Sets`,
        rows: exercise.sets.map((set) => {
          const previousSet = previousExercise?.sets?.find((x) => x.setIndex === set.setIndex);
          const deltaWeightNum = set.weight - safeNum(previousSet?.weight);
          const deltaRepNum = set.reps - safeNum(previousSet?.reps);
          return {
            set: set.setIndex,
            prev: `${safeNum(previousSet?.weight)}x${safeNum(previousSet?.reps)}`,
            curr: `${set.weight}x${set.reps}`,
            deltaWeight: deltaWeightNum === 0 ? "-" : `${deltaWeightNum > 0 ? "+" : ""}${deltaWeightNum} lbs`,
            deltaRep: deltaRepNum === 0 ? "-" : `${deltaRepNum > 0 ? "+" : ""}${deltaRepNum} rep${Math.abs(deltaRepNum) > 1 ? "s" : ""}`,
            isPositiveRep: deltaRepNum > 0,
            isNegativeRep: deltaRepNum < 0,
          };
        }),
      };
    }),
  };
}
