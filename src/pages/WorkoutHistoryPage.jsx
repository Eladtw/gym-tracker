import { ChevronRight, Clock3, Dumbbell, Layers3 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchWorkoutHistoryList } from "../data/workoutHistoryService";
import "../css/workout-history-page.css";

const statusClass = {
  positive: "wh-status--positive",
  neutral: "wh-status--neutral",
  negative: "wh-status--negative",
};

export default function WorkoutHistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const result = await fetchWorkoutHistoryList(40);
        if (!alive) return;
        setItems(result);
      } catch (error) {
        if (!alive) return;
        setMsg(error?.message || "Failed to load workout history");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="wh-page">
      <header className="wh-header">
        <h1>History</h1>
      </header>

      {loading ? <p className="wh-state">Loading history…</p> : null}
      {!loading && msg ? <p className="wh-state wh-state--error">{msg}</p> : null}

      <main className="wh-list">
        {items.map((item) => (
          <article
            key={item.id}
            className="wh-card"
            onClick={() => navigate(`/history/${item.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate(`/history/${item.id}`);
              }
            }}
          >
            <div className="wh-card__top">
              <div>
                <h2>{item.name}</h2>
                <p>{item.dateLabel}</p>
              </div>

              <div className="wh-card__right">
                <span className={`wh-status ${statusClass[item.statusTone]}`}>{item.status}</span>
                <ChevronRight size={18} />
              </div>
            </div>

            <div className="wh-pills">
              {item.muscleGroups.map((muscle) => (
                <span key={muscle}>{muscle}</span>
              ))}
            </div>

            <div className="wh-metrics">
              <span><Dumbbell size={13} />{item.exercisesCount} exercises</span>
              <span><Layers3 size={13} />{item.setsCount} sets</span>
              <span><Clock3 size={13} />{item.duration}</span>
            </div>
          </article>
        ))}
      </main>
    </section>
  );
}
