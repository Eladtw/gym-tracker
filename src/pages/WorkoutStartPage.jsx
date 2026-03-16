import "../css/workout-start-page.css";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { Play, Dumbbell } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

function summarizeWorkout(workout) {
  const exercises = workout.exercises || [];
  const muscleGroups = new Set();

  let exerciseCount = 0;
  exercises.forEach((ex) => {
    exerciseCount += 1;
    const groupLabel =
      ex?.exercises_catalog?.primary_subgroup?.group?.label ||
      ex?.exercises_catalog?.primary_subgroup?.label ||
      null;

    if (groupLabel) muscleGroups.add(groupLabel);
  });

  return {
    exerciseCount,
    muscleGroups: Array.from(muscleGroups),
  };
}

export default function WorkoutStartPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [msg, setMsg] = useState("");

  async function loadData() {
    setLoading(true);
    setMsg("");

    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;

    if (!uid) {
      setLoading(false);
      setMsg("❌ Not logged in");
      return;
    }

    const [{ data: activeData, error: activeErr }, { data: workoutsData, error: wErr }, { data: exData, error: exErr }] =
      await Promise.all([
        supabase
          .from("sessions")
          .select("id, workout_id, session_date, started_at, ended_at")
          .eq("user_id", uid)
          .is("ended_at", null)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("workouts")
          .select("id, name, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),
        supabase
          .from("workout_exercises")
          .select(
            `
              id,
              workout_id,
              set_targets,
              exercises_catalog (
                id,
                primary_subgroup:muscle_subgroups!exercises_catalog_primary_subgroup_id_fkey (
                  id,
                  label,
                  group:muscle_groups!muscle_subgroups_group_id_fkey (
                    id,
                    label
                  )
                )
              )
            `
          ),
      ]);

    if (activeErr || wErr || exErr) {
      setMsg("❌ Failed to load workouts");
      setLoading(false);
      return;
    }

    setActiveSession(activeData || null);

    const byWorkout = new Map();
    (exData || []).forEach((ex) => {
      if (!byWorkout.has(ex.workout_id)) byWorkout.set(ex.workout_id, []);
      byWorkout.get(ex.workout_id).push(ex);
    });

    const merged = (workoutsData || []).map((w) => ({
      ...w,
      exercises: byWorkout.get(w.id) || [],
    }));

    setWorkouts(merged);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function startWorkout(workoutId) {
    if (!workoutId) return;

    setStartingId(workoutId);
    setMsg("");

    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;

    if (!uid) {
      setMsg("❌ Not logged in");
      setStartingId(null);
      return;
    }

    const { data: existingActive, error: activeErr } = await supabase
      .from("sessions")
      .select("id, workout_id")
      .eq("user_id", uid)
      .is("ended_at", null)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeErr) {
      setMsg("❌ " + activeErr.message);
      setStartingId(null);
      return;
    }

    if (existingActive?.id) {
      setStartingId(null);
      navigate(`/session/${existingActive.id}`);
      return;
    }

    const today = dayjs().format("YYYY-MM-DD");

    const { data, error } = await supabase
      .from("sessions")
      .insert({
        user_id: uid,
        workout_id: workoutId,
        session_date: today,
        started_at: new Date().toISOString(),
        ended_at: null,
      })
      .select("id")
      .single();

    setStartingId(null);

    if (error) {
      setMsg("❌ " + error.message);
      return;
    }

    navigate(`/session/${data.id}`);
  }

  const activeWorkoutName = useMemo(() => {
    if (!activeSession?.workout_id) return null;
    const found = workouts.find((w) => w.id === activeSession.workout_id);
    return found?.name || "Current workout";
  }, [activeSession, workouts]);

  return (
    <div className="workout-start-page">
      <header className="workout-start-header">
        <h1>Start Workout</h1>
        <p>Pick a workout and jump right into your session.</p>
      </header>

      {activeSession?.id && (
        <section className="workout-start-active">
          <div className="workout-start-active-copy">
            <span className="workout-start-active-label">Workout in Progress</span>
            <strong>{activeWorkoutName}</strong>
          </div>
          <button
            type="button"
            className="workout-start-continue-btn"
            onClick={() => navigate(`/session/${activeSession.id}`)}
          >
            Continue
          </button>
        </section>
      )}

      {msg && <p className="workout-start-msg">{msg}</p>}

      <section className="workout-start-list-wrap">
        {loading ? (
          <p className="workout-start-empty">Loading workouts…</p>
        ) : workouts.length === 0 ? (
          <p className="workout-start-empty">No workouts yet. Create one in Workouts first.</p>
        ) : (
          <ul className="workout-start-list">
            {workouts.map((workout) => {
              const stats = summarizeWorkout(workout);
              const muscleGroupsText =
                stats.muscleGroups.length > 0 ? stats.muscleGroups.join(" • ") : "Muscle groups not set";

              return (
                <li key={workout.id} className="workout-start-item">
                  <div className="workout-start-item-main">
                    <div className="workout-start-item-title-row">
                      <Dumbbell size={16} />
                      <h2>{workout.name}</h2>
                    </div>
                    <p className="workout-start-item-muscles">{muscleGroupsText}</p>
                    <p className="workout-start-item-meta">
                      {stats.exerciseCount} {stats.exerciseCount === 1 ? "exercise" : "exercises"}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="workout-start-play-btn"
                    aria-label={`Start ${workout.name}`}
                    onClick={() => startWorkout(workout.id)}
                    disabled={startingId === workout.id}
                  >
                    <Play size={18} fill="currentColor" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
