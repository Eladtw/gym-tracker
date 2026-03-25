import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import WorkoutHistoryHeaderCard from "../components/WorkoutHistoryHeaderCard";
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

  if (!detail && !msg) {
    return <p className="whl-state">Loading workout log…</p>;
  }

  return (
    <section className="whl-page">
      <WorkoutHistoryHeaderCard
        title={detail?.title || "Workout"}
        subtitle={detail?.subtitle || ""}
        pills={detail?.muscles || []}
        onBack={() => navigate(-1)}
      />

      <main className="whl-main">
        <h2>Workout Log</h2>
        {msg ? <p className="whl-state whl-state--error">{msg}</p> : null}

        <div className="whl-list">
          {(detail?.workoutLog || []).map((exercise) => {
            const isOpen = expanded === exercise.id;
            return (
              <article key={exercise.id} className="whl-item">
                <button
                  className="whl-item-head"
                  onClick={() => setExpanded((prev) => (prev === exercise.id ? null : exercise.id))}
                >
                  <div>
                    <h3>{exercise.name}</h3>
                    <p>{exercise.area}</p>
                    <strong>{exercise.setsLabel}</strong>
                  </div>
                  <ChevronDown className={isOpen ? "open" : ""} size={18} />
                </button>

                {isOpen ? (
                  <div className="whl-item-table-wrap">
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
