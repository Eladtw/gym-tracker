import "../css/workout-start-page.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Dumbbell } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getActiveSessionForUser, startOrResumeWorkoutSession } from "../lib/sessionFlow";

function getWorkoutMuscleGroups(exercises) {
  const set = new Set();
  (exercises || []).forEach((ex) => {
    const label = ex?.exercises_catalog?.primary_subgroup?.group?.label;
    if (label) set.add(label);
  });
  return Array.from(set);
}

export default function WorkoutStartPage() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);

      const active = await getActiveSessionForUser();
      if (active?.id) {
        navigate(`/session/${active.id}`);
        return;
      }

      const { data: auth } = await supabase.auth.getSession();
      const uid = auth?.session?.user?.id;
      if (!uid) {
        setWorkouts([]);
        setLoading(false);
        return;
      }

      const [workoutsRes, exRes] = await Promise.all([
        supabase
          .from("workouts")
          .select("id, name, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),
        supabase.from("workout_exercises").select(`
          id,
          workout_id,
          exercise_id,
          exercises_catalog (
            id,
            primary_subgroup:muscle_subgroups!exercises_catalog_primary_subgroup_id_fkey (
              id,
              group:muscle_groups!muscle_subgroups_group_id_fkey (
                id,
                label
              )
            )
          )
        `),
      ]);

      if (!isMounted) return;

      if (workoutsRes.error || exRes.error) {
        setMsg(`❌ ${workoutsRes.error?.message || exRes.error?.message || "Failed to load workouts"}`);
        setWorkouts([]);
      } else {
        const byWorkout = new Map();
        (exRes.data || []).forEach((ex) => {
          if (!byWorkout.has(ex.workout_id)) byWorkout.set(ex.workout_id, []);
          byWorkout.get(ex.workout_id).push(ex);
        });

        setWorkouts(
          (workoutsRes.data || []).map((workout) => {
            const exercises = byWorkout.get(workout.id) || [];
            return {
              ...workout,
              exercisesCount: exercises.length,
              muscleGroups: getWorkoutMuscleGroups(exercises),
            };
          })
        );
      }

      setLoading(false);
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const subtitle = useMemo(
    () =>
      workouts.length
        ? "Pick a workout and start tracking your session in seconds."
        : "Create a workout first, then come back here to start logging.",
    [workouts.length]
  );

  async function handleStartWorkout(workoutId) {
    setMsg("");
    setStartingId(workoutId);

    const result = await startOrResumeWorkoutSession(workoutId);
    setStartingId(null);

    if (result.error || !result.sessionId) {
      setMsg(`❌ ${result.error || "Unable to start workout"}`);
      return;
    }

    navigate(`/session/${result.sessionId}?date=${result.dateISO}`);
  }

  return (
    <div className="workout-start-page">
      <header className="workout-start-header">
        <div className="workout-start-date">Workout</div>
        <h1 className="workout-start-title">Start Your Workout</h1>
        <p className="workout-start-subtitle">{subtitle}</p>
      </header>

      {msg && <p className="workout-start-message">{msg}</p>}

      <section className="workout-start-list" aria-label="Workout list">
        {loading && <div className="workout-start-empty">Loading workouts…</div>}

        {!loading && workouts.length === 0 && (
          <div className="workout-start-empty">
            <p>No workouts yet.</p>
            <button type="button" className="workout-start-create-btn" onClick={() => navigate("/workouts")}>Create workout</button>
          </div>
        )}

        {!loading &&
          workouts.map((workout) => (
            <article key={workout.id} className="workout-start-card">
              <div className="workout-start-card-main">
                <div className="workout-start-card-name">{workout.name}</div>
                <div className="workout-start-card-meta">
                  {(workout.muscleGroups.length ? workout.muscleGroups : ["No muscle groups"]).join(" • ")}
                </div>
                <div className="workout-start-card-count">
                  <Dumbbell size={14} />
                  <span>
                    {workout.exercisesCount} {workout.exercisesCount === 1 ? "exercise" : "exercises"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="workout-start-play-btn"
                onClick={() => handleStartWorkout(workout.id)}
                aria-label={`Start ${workout.name}`}
                disabled={startingId === workout.id}
              >
                <Play size={18} fill="currentColor" />
              </button>
            </article>
          ))}
      </section>
    </div>
  );
}
