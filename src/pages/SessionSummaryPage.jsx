import "../css/session-summary-page.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function fmtDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return "—";
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "—";

  const totalSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(
      secs
    ).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatWeight(weight) {
  if (!Number.isFinite(Number(weight))) return "—";
  return `${Number(weight)} lbs`;
}

function SummarySkeleton() {
  return (
    <div className="session-summary-page">
      <div className="session-summary-shell session-summary-skeleton">
        <div className="session-summary-skeleton-block session-summary-skeleton-title" />
        <div className="session-summary-skeleton-block session-summary-skeleton-sub" />
        <div className="session-summary-stats-grid">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="session-summary-card">
              <div className="session-summary-skeleton-block session-summary-skeleton-mini" />
              <div className="session-summary-skeleton-block session-summary-skeleton-value" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SessionSummaryPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [sets, setSets] = useState([]);
  const [prevSets, setPrevSets] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [workoutName, setWorkoutName] = useState("Workout");
  const [historicalSetsBeforeCurrent, setHistoricalSetsBeforeCurrent] = useState([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      const { data: authData } = await supabase.auth.getSession();
      const authedUserId = authData?.session?.user?.id || null;

      const { data: currentSession, error: sessionErr } = await supabase
        .from("sessions")
        .select("id, user_id, workout_id, started_at, ended_at")
        .eq("id", sessionId)
        .single();

      if (!active) return;

      if (sessionErr || !currentSession) {
        setError(sessionErr?.message || "Session not found");
        setLoading(false);
        return;
      }

      if (authedUserId && currentSession.user_id !== authedUserId) {
        setError("You do not have permission to view this session.");
        setLoading(false);
        return;
      }

      setSession(currentSession);

      if (currentSession.workout_id) {
        const { data: workoutRow } = await supabase
          .from("workouts")
          .select("name")
          .eq("id", currentSession.workout_id)
          .maybeSingle();

        if (!active) return;
        setWorkoutName(workoutRow?.name || "Workout");
      }

      const { data: currentSets, error: setsErr } = await supabase
        .from("sets")
        .select(
          "id, session_id, exercise_id, variation_id, exercise_name, set_index, reps, weight, created_at"
        )
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (!active) return;

      if (setsErr) {
        setError(setsErr.message);
        setLoading(false);
        return;
      }

      setSets(currentSets || []);

      if (
        !currentSession?.user_id ||
        !currentSession?.workout_id ||
        !currentSession?.ended_at
      ) {
        setPrevSets([]);
        setHistoryRows([]);
        setHistoricalSetsBeforeCurrent([]);
        setLoading(false);
        return;
      }

      const { data: historySessions, error: historyErr } = await supabase
        .from("sessions")
        .select("id, session_date, started_at, ended_at")
        .eq("user_id", currentSession.user_id)
        .eq("workout_id", currentSession.workout_id)
        .not("ended_at", "is", null)
        .lte("ended_at", currentSession.ended_at)
        .order("ended_at", { ascending: false })
        .limit(8);

      if (!active) return;

      if (historyErr) {
        setError(historyErr.message);
        setLoading(false);
        return;
      }

      const orderedHistory = historySessions || [];
      setHistoryRows(orderedHistory);

      const prevSession = orderedHistory.find((row) => row.id !== currentSession.id);
      if (!prevSession?.id) {
        setPrevSets([]);
      } else {
        const { data: previousSets, error: prevSetsErr } = await supabase
          .from("sets")
          .select("id, exercise_id, variation_id, exercise_name, set_index, reps, weight")
          .eq("session_id", prevSession.id);

        if (!active) return;

        if (prevSetsErr) {
          setError(prevSetsErr.message);
          setLoading(false);
          return;
        }

        setPrevSets(previousSets || []);
      }

      const earlierSessionIds = orderedHistory
        .filter((row) => row.id !== currentSession.id)
        .map((row) => row.id)
        .filter(Boolean);

      if (!earlierSessionIds.length) {
        setHistoricalSetsBeforeCurrent([]);
        setLoading(false);
        return;
      }

      const { data: allPrevSets, error: allPrevSetsErr } = await supabase
        .from("sets")
        .select("id, exercise_id, variation_id, exercise_name, set_index, reps, weight")
        .in("session_id", earlierSessionIds);

      if (!active) return;

      if (allPrevSetsErr) {
        setError(allPrevSetsErr.message);
        setLoading(false);
        return;
      }

      setHistoricalSetsBeforeCurrent(allPrevSets || []);
      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [sessionId]);

  const summary = useMemo(() => {
    const safeSets = sets || [];
    const totalSets = safeSets.length;
    const totalReps = safeSets.reduce((sum, row) => sum + (Number(row?.reps) || 0), 0);
    const totalVolume = safeSets.reduce(
      (sum, row) => sum + (Number(row?.reps) || 0) * (Number(row?.weight) || 0),
      0
    );

    const exerciseMap = new Map();
    for (const row of safeSets) {
      const key = `${row.exercise_id || "unknown"}:${row.variation_id || "null"}`;
      const prev = exerciseMap.get(key) || {
        name: row.exercise_name || "Exercise",
        reps: 0,
        volume: 0,
        topWeight: 0,
      };
      const reps = Number(row?.reps) || 0;
      const weight = Number(row?.weight) || 0;
      prev.reps += reps;
      prev.volume += reps * weight;
      prev.topWeight = Math.max(prev.topWeight, weight);
      exerciseMap.set(key, prev);
    }

    const prevMap = new Map();
    for (const row of prevSets || []) {
      const key = `${row.exercise_id || "unknown"}:${row.variation_id || "null"}`;
      const prev = prevMap.get(key) || { reps: 0, volume: 0, topWeight: 0 };
      const reps = Number(row?.reps) || 0;
      const weight = Number(row?.weight) || 0;
      prev.reps += reps;
      prev.volume += reps * weight;
      prev.topWeight = Math.max(prev.topWeight, weight);
      prevMap.set(key, prev);
    }

    const improvements = Array.from(exerciseMap.entries())
      .map(([key, curr]) => {
        const prev = prevMap.get(key);
        const prevVolume = prev?.volume || 0;
        const deltaVolume = curr.volume - prevVolume;
        const pct = prevVolume > 0 ? Math.round((deltaVolume / prevVolume) * 100) : null;

        return {
          key,
          name: curr.name,
          deltaVolume,
          pct,
          currVolume: curr.volume,
          prevVolume,
        };
      })
      .filter((item) => item.deltaVolume > 0)
      .sort((a, b) => b.deltaVolume - a.deltaVolume)
      .slice(0, 3);

    const allTimeByExercise = new Map();
    for (const row of safeSets) {
      const key = `${row.exercise_id || "unknown"}:${row.variation_id || "null"}`;
      const prev = allTimeByExercise.get(key) || {
        name: row.exercise_name || "Exercise",
        topWeight: 0,
      };
      prev.topWeight = Math.max(prev.topWeight, Number(row?.weight) || 0);
      allTimeByExercise.set(key, prev);
    }

    const prevBestByExercise = new Map();
    for (const row of historicalSetsBeforeCurrent || []) {
      const key = `${row.exercise_id || "unknown"}:${row.variation_id || "null"}`;
      const reps = Number(row?.reps) || 0;
      const weight = Number(row?.weight) || 0;
      const volume = reps * weight;

      const prev = prevBestByExercise.get(key) || {
        topWeight: 0,
        topVolume: 0,
      };

      prev.topWeight = Math.max(prev.topWeight, weight);
      prev.topVolume = Math.max(prev.topVolume, volume);
      prevBestByExercise.set(key, prev);
    }

    const prs = Array.from(allTimeByExercise.entries())
      .map(([key, item]) => {
        const currentTopVolume = safeSets
          .filter(
            (row) =>
              `${row.exercise_id || "unknown"}:${row.variation_id || "null"}` === key
          )
          .reduce((max, row) => {
            const reps = Number(row?.reps) || 0;
            const weight = Number(row?.weight) || 0;
            return Math.max(max, reps * weight);
          }, 0);

        const prevBest = prevBestByExercise.get(key) || { topWeight: 0, topVolume: 0 };
        return {
          name: item.name,
          topWeight: item.topWeight,
          prevTopWeight: prevBest.topWeight,
          currentTopVolume,
          prevTopVolume: prevBest.topVolume,
        };
      })
      .filter(
        (item) => item.topWeight > item.prevTopWeight || item.currentTopVolume > item.prevTopVolume
      )
      .sort((a, b) => b.topWeight - a.topWeight || b.currentTopVolume - a.currentTopVolume)
      .slice(0, 3);

    return {
      totalSets,
      totalReps,
      totalVolume,
      uniqueExercises: exerciseMap.size,
      improvements,
      prs,
    };
  }, [sets, prevSets, historicalSetsBeforeCurrent]);

  const historyCards = useMemo(() => {
    return (historyRows || []).map((row) => {
      const startedAt = row.started_at || null;
      const endedAt = row.ended_at || null;
      return {
        id: row.id,
        date: row.session_date || (startedAt ? new Date(startedAt).toISOString().slice(0, 10) : "—"),
        duration: fmtDuration(startedAt, endedAt),
      };
    });
  }, [historyRows]);

  if (loading) return <SummarySkeleton />;

  if (error) {
    return (
      <div className="session-summary-page">
        <div className="session-summary-shell">
          <div className="session-summary-error">Could not load summary: {error}</div>
          <button className="session-summary-btn" onClick={() => navigate("/home")}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="session-summary-page">
      <div className="session-summary-shell">
        <div className="session-summary-hero">
          <div className="session-summary-badge">Workout Complete</div>
          <h1 className="session-summary-title">{workoutName}: Amazing work 🔥</h1>
          <p className="session-summary-subtitle">
            Your session summary is ready. Keep this momentum for your next workout.
          </p>
        </div>

        <section className="session-summary-title-card">
          <h2 className="session-summary-title-card-text">Session Overview</h2>
        </section>
        <section className="session-summary-stats-grid">
          <article className="session-summary-card">
            <div className="session-summary-label">Duration</div>
            <div className="session-summary-value">
              {fmtDuration(session?.started_at, session?.ended_at)}
            </div>
          </article>
          <article className="session-summary-card">
            <div className="session-summary-label">Total Sets</div>
            <div className="session-summary-value">{summary.totalSets}</div>
          </article>
          <article className="session-summary-card">
            <div className="session-summary-label">Total Reps</div>
            <div className="session-summary-value">{summary.totalReps}</div>
          </article>
          <article className="session-summary-card">
            <div className="session-summary-label">Volume</div>
            <div className="session-summary-value">{Math.round(summary.totalVolume)} lbs</div>
          </article>
        </section>

        <section className="session-summary-panel">
          <div className="session-summary-title-card">
            <h2 className="session-summary-title-card-text">Top Improvements</h2>
          </div>
          <div className="session-summary-panel-title">Top Improvements vs. Last Session</div>
          {summary.improvements.length ? (
            <div className="session-summary-list">
              {summary.improvements.map((item) => (
                <div key={item.key} className="session-summary-list-item">
                  <div>
                    <div className="session-summary-item-title">{item.name}</div>
                    <div className="session-summary-item-sub">
                      {Math.round(item.prevVolume)} → {Math.round(item.currVolume)} lbs volume
                    </div>
                  </div>
                  <div className="session-summary-item-chip">
                    +{Math.round(item.deltaVolume)} lbs
                    {item.pct != null ? ` (${item.pct}%)` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="session-summary-empty">
              No previous workout to compare yet. Complete this workout again to unlock comparison insights.
            </div>
          )}
        </section>

        <section className="session-summary-panel">
          <div className="session-summary-title-card">
            <h2 className="session-summary-title-card-text">New PRs & Highlights</h2>
          </div>
          <div className="session-summary-panel-title">New PRs in this session</div>
          {summary.prs.length ? (
            <div className="session-summary-list">
              {summary.prs.map((item) => (
                <div key={`${item.name}-${item.topWeight}`} className="session-summary-list-item">
                  <div>
                    <div className="session-summary-item-title">{item.name}</div>
                    <div className="session-summary-item-sub">
                      Weight PR: {formatWeight(item.prevTopWeight)} → {formatWeight(item.topWeight)}
                    </div>
                  </div>
                  <div className="session-summary-item-chip is-pr">
                    New PR
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="session-summary-empty">
              No new PRs this time — consistency is still progress.
            </div>
          )}
        </section>

        <section className="session-summary-panel">
          <div className="session-summary-title-card">
            <h2 className="session-summary-title-card-text">Workout History</h2>
          </div>
          <div className="session-summary-panel-title">Your recent sessions for this workout</div>
          {historyCards.length ? (
            <div className="session-summary-list">
              {historyCards.map((item, idx) => (
                <div key={item.id} className="session-summary-list-item">
                  <div>
                    <div className="session-summary-item-title">
                      {idx === 0 ? "Current session" : `Previous session #${idx}`}
                    </div>
                    <div className="session-summary-item-sub">{item.date}</div>
                  </div>
                  <div className="session-summary-item-chip">{item.duration}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="session-summary-empty">No completed sessions found yet.</div>
          )}
        </section>

        <div className="session-summary-actions">
          <button className="session-summary-btn" onClick={() => navigate("/progress")}>View Progress</button>
          <button
            className="session-summary-btn session-summary-btn--ghost"
            onClick={() => navigate("/home")}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
