import { ArrowLeft, ArrowRight, ChevronRight, Settings, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchWorkoutHistorySession } from "../data/workoutHistoryService";
import "../css/workout-history-detail-page.css";

export default function WorkoutHistoryDetailPage() {
  const navigate = useNavigate();
  const { historyId } = useParams();
  const [detail, setDetail] = useState(null);
  const [metric, setMetric] = useState("reps");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchWorkoutHistorySession(historyId);
        if (!alive) return;
        setDetail(data);
      } catch (error) {
        if (alive) setMsg(error?.message || "Failed to load workout details");
      }
    })();
    return () => {
      alive = false;
    };
  }, [historyId]);

  const topItems = useMemo(() => {
    if (!detail) return [];
    const sorted = [...detail.allImprovements]
      .filter((a) => {
        if (metric === "reps") return a.deltaReps > 0;
        if (metric === "volume") return a.deltaVolume > 0;
        return a.deltaWeight > 0;
      })
      .sort((a, b) => {
        if (metric === "reps") return b.deltaReps - a.deltaReps;
        if (metric === "volume") return b.deltaVolume - a.deltaVolume;
        return b.deltaWeight - a.deltaWeight;
      });
    return sorted.slice(0, 3);
  }, [detail, metric]);

  if (!detail && !msg) return <p className="whd-state">Loading workout details…</p>;
  if (msg) return <p className="whd-state whd-state--error">{msg}</p>;

  return (
    <section className="whd-page">
      <header className="whd-header">
        <div className="whd-header-top">
          <button className="whd-back" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft size={19} />
          </button>
          <div className="whd-title-wrap">
            <h1>{detail.title}</h1>
            <p>{detail.subtitle}</p>
          </div>
          <span className="whd-spacer" />
        </div>

        <div className="whd-pills">
          {detail.muscles.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </header>

      <main className="whd-main">
        <div className="whd-summary-row">
          <h2>Summary</h2>
          <button type="button" aria-label="settings"><Settings size={16} /></button>
        </div>

        <section className="whd-summary-cards">
          <article>
            <p>Total Exercises</p>
            <div>
              <strong>{detail.summary.totalExercises}</strong>
              <span className={detail.summary.totalExercisesDelta < 0 ? "delta-negative" : "delta-positive"}>{detail.summary.totalExercisesDelta >= 0 ? "+" : ""}{detail.summary.totalExercisesDelta} vs last</span>
            </div>
          </article>
          <article>
            <p>Total Volume</p>
            <div>
              <strong>{detail.summary.totalVolume} lbs</strong>
              <span className={detail.summary.totalVolumeDelta < 0 ? "delta-negative" : "delta-positive"}>{detail.summary.totalVolumeDelta >= 0 ? "+" : ""}{detail.summary.totalVolumeDelta} vs last</span>
            </div>
          </article>
        </section>

        <section className="whd-improvements-card">
          <h3>Top Improvements</h3>

          <div className="whd-segmented">
            <button className={metric === "reps" ? "active" : ""} onClick={() => setMetric("reps")}>Reps</button>
            <button className={metric === "weight" ? "active" : ""} onClick={() => setMetric("weight")}>Weight</button>
            <button className={metric === "volume" ? "active" : ""} onClick={() => setMetric("volume")}>Volume</button>
          </div>

          <div className="whd-improvement-list">
            {topItems.length === 0 ? <p className="whd-empty">No improvements in this category yet.</p> : null}
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

        <section className="whd-log-link-card">
          <button onClick={() => navigate("log") }>
            <span>Workout Log</span>
            <ChevronRight size={18} />
          </button>
        </section>
      </main>
    </section>
  );
}
