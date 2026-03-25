import { ChevronRight, Clock3, Dumbbell, Layers3 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import WorkoutHistoryHeaderCard from "../components/WorkoutHistoryHeaderCard";
import { fetchWorkoutHistoryList } from "../data/workoutHistoryService";
import "../css/workout-history-page.css";

const statusClass = {
  positive: "workout-history-status--positive",
  neutral: "workout-history-status--neutral",
  negative: "workout-history-status--negative",
};

export default function WorkoutHistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setMsg("");

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
    <section className="workout-history-page">
      <WorkoutHistoryHeaderCard title="History" />

      {loading ? <p className="workout-history-state">Loading history…</p> : null}
      {!loading && msg ? <p className="workout-history-state workout-history-state--error">{msg}</p> : null}
      {!loading && !msg && items.length === 0 ? (
        <p className="workout-history-state">No completed sessions yet.</p>
      ) : null}

      <div className="workout-history-list">
        {items.map((item) => (
          <article
            key={item.id}
            className="workout-history-card"
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
            <div className="workout-history-card__top">
              <div>
                <h2>{item.name}</h2>
                <p>{item.dateLabel}</p>
              </div>

              <div className="workout-history-card__top-right">
                <span className={`workout-history-status ${statusClass[item.statusTone]}`}>
                  {item.status}
                </span>
                <ChevronRight size={18} />
              </div>
            </div>

            <div className="workout-history-muscles">
              {item.muscleGroups.map((muscle) => (
                <span key={muscle}>{muscle}</span>
              ))}
            </div>

            <div className="workout-history-card__metrics">
              <span>
                <Dumbbell size={13} />
                {item.exercisesCount} exercises
              </span>
              <span>
                <Layers3 size={13} />
                {item.setsCount} sets
              </span>
              <span>
                <Clock3 size={13} />
                {item.duration}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
