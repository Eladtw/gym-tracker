import { ArrowLeft, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchWorkoutHistorySession } from "../data/workoutHistoryService";
import "../css/workout-history-improvements-page.css";

export default function WorkoutHistoryImprovementsPage() {
  const navigate = useNavigate();
  const { historyId } = useParams();
  const [detail, setDetail] = useState(null);
  const [metric, setMetric] = useState("reps");
  const [openId, setOpenId] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchWorkoutHistorySession(historyId);
        if (!alive) return;
        setDetail(data);
        setOpenId(data.allImprovements[0]?.key ?? null);
      } catch (error) {
        if (alive) setMsg(error?.message || "Failed to load improvements");
      }
    })();
    return () => {
      alive = false;
    };
  }, [historyId]);

  const items = useMemo(() => {
    if (!detail) return [];
    const sorted = [...detail.allImprovements].filter((a) => {
      if (metric === "reps") return a.deltaReps > 0;
      if (metric === "volume") return a.deltaVolume > 0;
      return a.deltaWeight > 0;
    });
    sorted.sort((a, b) => {
      if (metric === "weight") return b.deltaWeight - a.deltaWeight;
      if (metric === "volume") return b.deltaVolume - a.deltaVolume;
      return b.deltaReps - a.deltaReps;
    });
    return sorted;
  }, [detail, metric]);


  useEffect(() => {
    setOpenId((prev) => (items.some((x) => x.key === prev) ? prev : items[0]?.key ?? null));
  }, [items]);

  return (
    <section className="whi-page">
      <header className="whi-header">
        <button onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft size={18} /></button>
        <h1>All Improvements</h1>
        <span />
      </header>

      {msg ? <p className="whi-state whi-state--error">{msg}</p> : null}

      <div className="whi-segmented">
        <button className={metric === "reps" ? "active" : ""} onClick={() => setMetric("reps")}>Reps</button>
        <button className={metric === "weight" ? "active" : ""} onClick={() => setMetric("weight")}>Weight</button>
        <button className={metric === "volume" ? "active" : ""} onClick={() => setMetric("volume")}>Volume</button>
      </div>

      <main className="whi-list">
        {items.length === 0 ? <p className="whi-state">No improved exercises for this category yet.</p> : null}
        {items.map((item) => {
          const isOpen = openId === item.key;
          const topDelta = metric === "weight" ? item.deltaWeight : metric === "volume" ? item.deltaVolume : item.deltaReps;
          return (
            <article key={item.key} className="whi-card">
              <button className="whi-card-head" onClick={() => setOpenId((p) => (p === item.key ? null : item.key))}>
                <div>
                  <h2>{item.name}</h2>
                  <p>
                    <span>{item.group}</span>
                    <span>
                      {metric === "weight"
                        ? `${item.bestWeight - item.deltaWeight} lbs → ${item.bestWeight} lbs`
                        : metric === "volume"
                        ? `${Math.round(item.totalVolume - item.deltaVolume)} → ${Math.round(item.totalVolume)}`
                        : `${item.bestReps - item.deltaReps} reps → ${item.bestReps} reps`}
                    </span>
                  </p>
                </div>
                <div>
                  <strong>{topDelta >= 0 ? "+" : ""}{Math.round(topDelta)} {metric === "reps" ? "reps" : metric === "weight" ? "lbs" : "vol"}</strong>
                  <ChevronDown size={16} className={isOpen ? "open" : ""} />
                </div>
              </button>

              {isOpen ? (
                <div className="whi-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Set</th>
                        <th>Prev</th>
                        <th>Current</th>
                        <th>Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.rows.map((row) => (
                        <tr key={`${item.key}-${row.set}`}>
                          <td>{row.set}</td>
                          <td>{row.prev}</td>
                          <td>{row.current}</td>
                          <td>
                            {metric === "weight"
                              ? `${row.deltaWeight >= 0 ? "+" : ""}${row.deltaWeight} lbs`
                              : metric === "volume"
                              ? `${row.deltaVolume >= 0 ? "+" : ""}${Math.round(row.deltaVolume)} vol`
                              : `${row.deltaReps >= 0 ? "+" : ""}${row.deltaReps} reps`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </article>
          );
        })}
      </main>
    </section>
  );
}
