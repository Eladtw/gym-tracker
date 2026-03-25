import { ChevronRight, Clock3, Dumbbell, Layers3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { workoutHistoryItems } from "../data/workoutHistoryMock";
import "../css/workout-history-page.css";

const statusClass = {
  positive: "workout-history-status--positive",
  neutral: "workout-history-status--neutral",
  negative: "workout-history-status--negative",
};

export default function WorkoutHistoryPage() {
  const navigate = useNavigate();

  return (
    <section className="workout-history-page">
      <header className="workout-history-page__header">
        <h1>History</h1>
      </header>

      <div className="workout-history-list">
        {workoutHistoryItems.map((item) => (
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
              {item.setsCount ? (
                <span>
                  <Layers3 size={13} />
                  {item.setsCount} sets
                </span>
              ) : null}
              <span>
                <Clock3 size={13} />
                {item.duration}
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="workout-history-load-more-wrap">
        <button type="button" className="workout-history-load-more-btn">
          Load More
        </button>
      </div>
    </section>
  );
}
