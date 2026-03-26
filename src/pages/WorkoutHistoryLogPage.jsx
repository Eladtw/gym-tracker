import { ArrowLeft, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchWorkoutHistorySession } from "../data/workoutHistoryService";
import "../css/workout-history-log-page.css";

export default function WorkoutHistoryLogPage() {
  const navigate = useNavigate();
  const { historyId } = useParams();
  const [detail, setDetail] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchWorkoutHistorySession(historyId);
        if (!alive) return;
        setDetail(data);
        setExpanded(data.workoutLog[0]?.id ?? null);
      } catch (error) {
        if (alive) setMsg(error?.message || "Failed to load workout log");
      }
    })();
    return () => {
      alive = false;
    };
  }, [historyId]);

  if (!detail && !msg) return <p className="whl-state">Loading workout log…</p>;

  return (
    <section className="whl-page">
      <header className="whl-header">
        <div className="whl-header-top">
          <button onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft size={18} /></button>
          <div>
            <h1>{detail?.title || "Workout"}</h1>
            <p>{detail?.subtitle || ""}</p>
          </div>
          <span />
        </div>

        <div className="whl-pills">
          {(detail?.muscles || []).map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </header>

      <main className="whl-main">
        <h2>Workout Log</h2>
        {msg ? <p className="whl-state whl-state--error">{msg}</p> : null}

        <div className="whl-list">
          {(detail?.workoutLog || []).map((exercise) => {
            const isOpen = expanded === exercise.id;
            return (
              <article key={exercise.id} className="whl-card">
                <button className="whl-card-head" onClick={() => setExpanded((p) => (p === exercise.id ? null : exercise.id))}>
                  <div>
                    <h3>{exercise.name}</h3>
                    <p>{exercise.area}</p>
                    <strong>{exercise.setsLabel}</strong>
                  </div>
                  <ChevronDown size={18} className={isOpen ? "open" : ""} />
                </button>

                {isOpen ? (
                  <div className="whl-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Set</th>
                          <th>Prev</th>
                          <th>Curr</th>
                          <th>Δ Wt</th>
                          <th>Δ Rep</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exercise.rows.map((row) => (
                          <tr key={`${exercise.id}-${row.set}`}>
                            <td>{row.set}</td>
                            <td>{row.prev}</td>
                            <td className="current">{row.curr}</td>
                            <td className={row.deltaWeight.startsWith("+") ? "positive" : ""}>{row.deltaWeight}</td>
                            <td className={row.isPositiveRep ? "positive" : row.isNegativeRep ? "negative" : ""}>{row.deltaRep}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </main>
    </section>
  );
}
