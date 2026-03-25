import { ArrowLeft, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { workoutHistoryDetailMock, workoutLogMock } from "../data/workoutHistoryMock";
import "../css/workout-history-log-page.css";

export default function WorkoutHistoryLogPage() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(workoutLogMock[0]?.id ?? null);

  return (
    <section className="whl-page">
      <header className="whl-header">
        <div className="whl-top-row">
          <button onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>{workoutHistoryDetailMock.title}</h1>
            <p>{workoutHistoryDetailMock.subtitle}</p>
          </div>
        </div>

        <div className="whl-muscles">
          {workoutHistoryDetailMock.muscles.map((muscle) => (
            <span key={muscle}>{muscle}</span>
          ))}
        </div>
      </header>

      <main className="whl-main">
        <h2>Workout Log</h2>

        <div className="whl-list">
          {workoutLogMock.map((exercise) => {
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
