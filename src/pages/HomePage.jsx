import "../css/home-page.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { startOrResumeWorkoutSession } from "../lib/sessionFlow";
import { Play, ChevronRight, Calendar, Flame, Clock, TrendingUp } from "lucide-react";

// Helper: get muscle group labels from workout exercises
function getMuscleGroups(exercises) {
  const set = new Set();
  (exercises || []).forEach((ex) => {
    const label =
      ex.exercises_catalog?.primary_subgroup?.group?.label ||
      ex.exercises_catalog?.primary_subgroup?.label ||
      null;
    if (label) set.add(label);
  });
  return Array.from(set);
}

// Helper: format duration
function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return "--";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms <= 0) return "--";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Helper: format date
function formatDate(dateStr) {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HomePageSkeleton() {
  return (
    <div className="home-page">
      <div className="home-skeleton-shell">
        <section className="home-welcome">
          <div className="home-skeleton home-skeleton-title" />
          <div className="home-skeleton home-skeleton-subtitle" />
        </section>

        <section className="home-section">
          <div className="home-section-header">
            <div className="home-skeleton-header-copy">
              <div className="home-skeleton home-skeleton-section-title" />
              <div className="home-skeleton home-skeleton-section-desc" />
            </div>
            <div className="home-skeleton home-skeleton-badge" />
          </div>

          <div className="home-card-scroll home-card-scroll--workouts">
            {[1, 2, 3].map((item) => (
              <div key={item} className="home-workout-row home-workout-row--combined">
                <div className="home-workout-info">
                  <div className="home-skeleton home-skeleton-row-title" />
                  <div className="home-workout-muscles">
                    <div className="home-skeleton home-skeleton-chip" />
                    <div className="home-skeleton home-skeleton-chip home-skeleton-chip--wide" />
                    <div className="home-skeleton home-skeleton-chip" />
                  </div>
                  <div className="home-skeleton home-skeleton-row-meta" />
                </div>

                <div className="home-workout-actions">
                  <div className="home-skeleton home-skeleton-icon-btn" />
                  <div className="home-skeleton home-skeleton-icon-btn" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="home-section">
          <div className="home-section-header">
            <div className="home-skeleton-header-copy">
              <div className="home-skeleton home-skeleton-section-title" />
              <div className="home-skeleton home-skeleton-section-desc" />
            </div>
          </div>

          <div className="home-history-list">
            {[1, 2, 3].map((item) => (
              <div key={item} className="home-history-row">
                <div className="home-history-info">
                  <div className="home-skeleton home-skeleton-row-title" />
                  <div className="home-workout-muscles">
                    <div className="home-skeleton home-skeleton-chip" />
                    <div className="home-skeleton home-skeleton-chip" />
                  </div>
                  <div className="home-skeleton home-skeleton-date" />
                </div>
                <div className="home-skeleton home-skeleton-duration" />
              </div>
            ))}
          </div>
        </section>

        <section className="home-section home-section--stats">
          <div className="home-section-header">
            <div className="home-skeleton-header-copy">
              <div className="home-skeleton home-skeleton-section-title" />
              <div className="home-skeleton home-skeleton-section-desc" />
            </div>
          </div>

          <div className="home-stats-grid">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="home-stat-card">
                <div className="home-skeleton home-skeleton-stat-icon" />
                <div className="home-skeleton home-skeleton-stat-value" />
                <div className="home-skeleton home-skeleton-stat-label" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  const [userName, setUserName] = useState("");
  const [workouts, setWorkouts] = useState([]);
  const [workoutExercises, setWorkoutExercises] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    const email = sessionData?.session?.user?.email || "";

    if (!uid) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", uid)
      .single();

    const displayName = profile?.display_name || email.split("@")[0] || "Athlete";
    setUserName(displayName);

    const [workoutsRes, exercisesRes, sessionsRes] = await Promise.all([
      supabase
        .from("workouts")
        .select("id, name, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
      supabase
        .from("workout_exercises")
        .select(
          `id, workout_id, exercise_name, set_targets,
           exercises_catalog (
             id, name, primary_subgroup_id,
             primary_subgroup:muscle_subgroups!exercises_catalog_primary_subgroup_id_fkey (
               id, label,
               group:muscle_groups!muscle_subgroups_group_id_fkey ( id, label )
             )
           )`
        ),
      supabase
        .from("sessions")
        .select("id, workout_id, session_date, started_at, ended_at")
        .eq("user_id", uid)
        .not("ended_at", "is", null)
        .order("session_date", { ascending: false })
        .limit(100),
    ]);

    setWorkouts(workoutsRes.data || []);
    setWorkoutExercises(exercisesRes.data || []);
    setRecentSessions((sessionsRes.data || []).slice(0, 4));
    setAllSessions(sessionsRes.data || []);
    setLoading(false);
  }

  const enrichedWorkouts = useMemo(() => {
    const byWorkout = new Map();

    (workoutExercises || []).forEach((ex) => {
      if (!byWorkout.has(ex.workout_id)) byWorkout.set(ex.workout_id, []);
      byWorkout.get(ex.workout_id).push(ex);
    });

    return (workouts || []).map((w) => {
      const exercises = byWorkout.get(w.id) || [];
      return {
        ...w,
        exercises,
        muscleGroups: getMuscleGroups(exercises),
      };
    });
  }, [workouts, workoutExercises]);

  const enrichedSessions = useMemo(() => {
    return (recentSessions || []).map((s) => {
      const workout = enrichedWorkouts.find((w) => w.id === s.workout_id);
      return {
        ...s,
        workoutName: workout?.name || "Workout",
        muscleGroups: workout?.muscleGroups || [],
        duration: formatDuration(s.started_at, s.ended_at),
      };
    });
  }, [recentSessions, enrichedWorkouts]);

  const stats = useMemo(() => {
    const now = new Date();
    const sessions = allSessions || [];

    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const thisWeek = sessions.filter((s) => {
      const d = new Date(s.session_date || s.started_at);
      return d >= monday;
    }).length;

    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = sessions.filter((s) => {
      const d = new Date(s.session_date || s.started_at);
      return d >= firstOfMonth;
    }).length;

    let streak = 0;
    if (sessions.length > 0) {
      const uniqueDates = new Set(
        sessions.map((s) => {
          const d = new Date(s.session_date || s.started_at);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        })
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(today.getDate()).padStart(2, "0")}`;

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const yesterdayStr = `${yesterday.getFullYear()}-${String(
        yesterday.getMonth() + 1
      ).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

      let checkDate;
      if (uniqueDates.has(todayStr)) {
        checkDate = new Date(today);
      } else if (uniqueDates.has(yesterdayStr)) {
        checkDate = new Date(yesterday);
      } else {
        checkDate = null;
      }

      if (checkDate) {
        while (true) {
          const dateStr = `${checkDate.getFullYear()}-${String(
            checkDate.getMonth() + 1
          ).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;

          if (uniqueDates.has(dateStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }
    }

    let avgDuration = "--";
    const sessionsWithDuration = sessions.filter((s) => s.started_at && s.ended_at);

    if (sessionsWithDuration.length > 0) {
      const totalMs = sessionsWithDuration.reduce((acc, s) => {
        return (
          acc +
          (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime())
        );
      }, 0);

      const avgMins = Math.round(totalMs / sessionsWithDuration.length / 60000);
      avgDuration =
        avgMins < 60
          ? `${avgMins}m`
          : `${Math.floor(avgMins / 60)}h ${avgMins % 60}m`;
    }

    return { thisWeek, thisMonth, streak, avgDuration };
  }, [allSessions]);

  async function handleStartWorkout(workoutId) {
    const result = await startOrResumeWorkoutSession(workoutId);
    if (result.error || !result.sessionId) {
      console.error("Failed to start session:", result.error);
      return;
    }

    navigate(`/session/${result.sessionId}?date=${result.dateISO}`);
  }

  if (loading) {
    return <HomePageSkeleton />;
  }

  return (
    <div className="home-page">
      <section className="home-welcome">
        <h1 className="home-welcome-title">Welcome back, {userName}</h1>
        <p className="home-welcome-sub">
          Ready to crush your goals today? Let&apos;s get moving.
        </p>
      </section>

      <section className="home-section">
        <div className="home-section-header">
          <div>
            <h2 className="home-section-title">Your Training Plans</h2>
            <p className="home-section-desc">
              Start a workout or open its details to review and manage your plan
            </p>
          </div>
          <span className="home-section-badge">{workouts.length} workouts</span>
        </div>

        <div className="home-card-scroll home-card-scroll--workouts">
          {enrichedWorkouts.length === 0 ? (
            <div className="home-empty-state">
              <p>No workouts yet. Create one to get started!</p>
              <button className="home-empty-btn" onClick={() => navigate("/workouts")}>
                Create Workout
              </button>
            </div>
          ) : (
            enrichedWorkouts.map((w) => (
              <div key={w.id} className="home-workout-row home-workout-row--combined">
                <div className="home-workout-info">
                  <div className="home-workout-name">{w.name}</div>

                  <div className="home-workout-muscles">
                    {w.muscleGroups.length > 0 ? (
                      w.muscleGroups.map((mg) => (
                        <span key={mg} className="home-muscle-chip">
                          {mg}
                        </span>
                      ))
                    ) : (
                      <span className="home-muscle-chip home-muscle-chip--empty">
                        No muscle groups
                      </span>
                    )}
                  </div>

                  <div className="home-workout-meta">
                    {w.exercises.length} {w.exercises.length === 1 ? "exercise" : "exercises"}
                  </div>
                </div>

                <div className="home-workout-actions">
                  <button
                    className="home-icon-btn home-detail-btn"
                    onClick={() => navigate(`/workouts/${w.id}`)}
                    aria-label={`Open details for ${w.name}`}
                    title="Workout details"
                    type="button"
                  >
                    <ChevronRight size={20} className="home-chevron-icon" />
                  </button>

                  <button
                    className="home-icon-btn home-play-btn"
                    onClick={() => handleStartWorkout(w.id)}
                    aria-label={`Start ${w.name}`}
                    title="Start workout"
                    type="button"
                  >
                    <Play size={18} fill="currentColor" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-header">
          <div>
            <h2 className="home-section-title">Workout History</h2>
            <p className="home-section-desc">Your most recent training sessions</p>
          </div>
        </div>

        <div className="home-history-list">
          {enrichedSessions.length === 0 ? (
            <div className="home-empty-state">
              <p>No completed workouts yet. Start your first session!</p>
            </div>
          ) : (
            enrichedSessions.map((s) => (
              <div key={s.id} className="home-history-row">
                <div className="home-history-info">
                  <div className="home-history-name">{s.workoutName}</div>
                  <div className="home-workout-muscles">
                    {s.muscleGroups.length > 0
                      ? s.muscleGroups.map((mg) => (
                          <span key={mg} className="home-muscle-chip">
                            {mg}
                          </span>
                        ))
                      : null}
                  </div>
                  <div className="home-history-date">
                    <Calendar size={13} />
                    <span>{formatDate(s.session_date)}</span>
                  </div>
                </div>
                <div className="home-history-duration">
                  <Clock size={14} />
                  <span>{s.duration}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="home-section home-section--stats">
        <div className="home-section-header">
          <div>
            <h2 className="home-section-title">Your Stats</h2>
            <p className="home-section-desc">Track your consistency</p>
          </div>
        </div>

        <div className="home-stats-grid">
          <div className="home-stat-card">
            <div className="home-stat-icon home-stat-icon--week">
              <Calendar size={20} />
            </div>
            <div className="home-stat-value">{stats.thisWeek}</div>
            <div className="home-stat-label">This Week</div>
          </div>

          <div className="home-stat-card">
            <div className="home-stat-icon home-stat-icon--month">
              <TrendingUp size={20} />
            </div>
            <div className="home-stat-value">{stats.thisMonth}</div>
            <div className="home-stat-label">This Month</div>
          </div>

          <div className="home-stat-card">
            <div className="home-stat-icon home-stat-icon--streak">
              <Flame size={20} />
            </div>
            <div className="home-stat-value">{stats.streak}</div>
            <div className="home-stat-label">Day Streak</div>
          </div>

          <div className="home-stat-card">
            <div className="home-stat-icon home-stat-icon--avg">
              <Clock size={20} />
            </div>
            <div className="home-stat-value">{stats.avgDuration}</div>
            <div className="home-stat-label">Avg Duration</div>
          </div>
        </div>
      </section>
    </div>
  );
}