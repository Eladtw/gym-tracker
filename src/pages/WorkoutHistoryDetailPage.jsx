import { ArrowRight, ChevronRight, Settings, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import WorkoutHistoryHeaderCard from "../components/WorkoutHistoryHeaderCard";
import { fetchWorkoutHistorySession } from "../data/workoutHistoryService";
import "../css/workout-history-detail-page.css";

export default function WorkoutHistoryDetailPage() {
  const navigate = useNavigate();
  const { historyId } = useParams();
  const [detail, setDetail] = useState(null);
  const [metric, setMetric] = useState("weight");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const data = await fetchWorkoutHistorySession(historyId);
        if (!alive) return;
        setDetail(data);
      } catch (error) {
        if (!alive) return;
        setMsg(error?.message || "Failed to load workout details");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [historyId]);

  const topItems = useMemo(() => {
    if (!detail) return [];
    const sorted = [...detail.allImprovements].sort((a, b) => {
      if (metric === "reps") return b.deltaReps - a.deltaReps;
      if (metric === "volume") return b.deltaVolume - a.deltaVolume;
      return b.deltaWeight - a.deltaWeight;
    });
    return sorted.slice(0, 3);
  }, [detail, metric]);

  if (loading) return <p className="whd-state">Loading workout details…</p>;
  if (msg || !detail) return <p className="whd-state whd-state--error">{msg || "Workout not found"}</p>;

  return (
    <section className="whd-page">
      <WorkoutHistoryHeaderCard
        title={detail.title}
        subtitle={detail.subtitle}
        pills={detail.muscles}
        onBack={() => navigate(-1)}
      />

      <main className="whd-main">
        <div className="whd-summary-top">
          <h2>Summary</h2>
          <button type="button" aria-label="Settings">
            <Settings size={16} />
          </button>
        </div>

        <section className="whd-summary-cards">
          <article>
            <p>Total Exercises</p>
            <div>
              <strong>{detail.summary.totalExercises}</strong>
              <span>{detail.summary.totalExercisesDelta >= 0 ? "+" : ""}{detail.summary.totalExercisesDelta} vs last</span>
            </div>
          </article>
          <article>
            <p>Total Volume</p>
            <div>
              <strong>{detail.summary.totalVolume} lbs</strong>
              <span>{detail.summary.totalVolumeDelta >= 0 ? "+" : ""}{detail.summary.totalVolumeDelta} vs last</span>
            </div>
          </article>
        </section>

        <section className="whd-improvements">
          <h3>Top Improvements</h3>

          <div className="whd-segments">
            <button type="button" className={metric === "reps" ? "active" : ""} onClick={() => setMetric("reps")}>Reps</button>
            <button type="button" className={metric === "weight" ? "active" : ""} onClick={() => setMetric("weight")}>Weight</button>
            <button type="button" className={metric === "volume" ? "active" : ""} onClick={() => setMetric("volume")}>Volume</button>
          </div>

          <div className="whd-improvements-list">
            {topItems.map((item) => (
              <article key={item.key}>
                <div>
                  <h4>{item.name}</h4>
                  <p>{item.area}</p>
                </div>
                <div>
                  <strong>
                    {metric === "reps" ? `${item.bestReps} reps` : metric === "volume" ? `${Math.round(item.totalVolume)} lbs` : `${item.bestWeight} lbs`}
                  </strong>
                  <span>
                    <TrendingUp size={12} />
                    {metric === "reps"
                      ? `${item.deltaReps >= 0 ? "+" : ""}${item.deltaReps} reps`
                      : metric === "volume"
                      ? `${item.deltaVolume >= 0 ? "+" : ""}${Math.round(item.deltaVolume)} lbs`
                      : `${item.deltaWeight >= 0 ? "+" : ""}${item.deltaWeight} lbs`}
                  </span>
                </div>
              </article>
            ))}
          </div>

          <button className="whd-view-all" onClick={() => navigate("improvements") }>
            View All
            <ArrowRight size={14} />
          </button>
        </section>

        <section className="whd-workout-log-card">
          <button onClick={() => navigate("log") }>
            <span>Workout Log</span>
            <ChevronRight size={18} />
          </button>
        </section>
      </main>
    </section>
  );
}
