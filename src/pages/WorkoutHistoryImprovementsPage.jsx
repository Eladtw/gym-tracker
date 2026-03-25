import { ArrowLeft, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { allImprovementsMock } from "../data/workoutHistoryMock";
import "../css/workout-history-improvements-page.css";

export default function WorkoutHistoryImprovementsPage() {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState(allImprovementsMock[0]?.id ?? null);

  return (
    <section className="whi-page">
      <header className="whi-header">
        <button onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <h1>All Improvements</h1>
      </header>

      <div className="whi-filter">
        <button className="active">Reps</button>
        <button>Weight</button>
        <button>Volume</button>
      </div>

      <div className="whi-list">
        {allImprovementsMock.map((item) => {
          const isOpen = openId === item.id;
          return (
            <article key={item.id} className="whi-item">
              <button
                className="whi-item-head"
                onClick={() => setOpenId((prev) => (prev === item.id ? null : item.id))}
              >
                <div>
                  <h2>{item.name}</h2>
                  <p>
                    <span>{item.group}</span>
                    <span>{item.fromTo}</span>
                  </p>
                </div>
                <div>
                  <strong>{item.delta}</strong>
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
                        <tr key={`${item.id}-${row.set}`}>
                          <td>{row.set}</td>
                          <td>{row.prev}</td>
                          <td>{row.current}</td>
                          <td>{row.delta}</td>
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
    </section>
  );
}
