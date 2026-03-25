import { ArrowLeft, ArrowRight, ChevronRight, Settings, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { workoutHistoryDetailMock } from "../data/workoutHistoryMock";
import "../css/workout-history-detail-page.css";

export default function WorkoutHistoryDetailPage() {
  const navigate = useNavigate();
  const detail = workoutHistoryDetailMock;

  return (
    <section className="whd-page">
      <header className="whd-header">
        <div className="whd-title-row">
          <button className="whd-back" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1>{detail.title}</h1>
            <p>{detail.subtitle}</p>
          </div>
          <span className="whd-empty" />
        </div>

        <div className="whd-muscles">
          {detail.muscles.map((muscle) => (
            <span key={muscle}>{muscle}</span>
          ))}
        </div>
      </header>

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
              <span>{detail.summary.totalExercisesDelta}</span>
            </div>
          </article>
          <article>
            <p>Total Volume</p>
            <div>
              <strong>{detail.summary.totalVolume}</strong>
              <span>{detail.summary.totalVolumeDelta}</span>
            </div>
          </article>
        </section>

        <section className="whd-improvements">
          <h3>Top Improvements</h3>

          <div className="whd-segments">
            <button type="button">Reps</button>
            <button type="button" className="active">Weight</button>
            <button type="button">Volume</button>
          </div>

          <div className="whd-improvements-list">
            {detail.improvementsTop.map((item) => (
              <article key={item.name}>
                <div>
                  <h4>{item.name}</h4>
                  <p>{item.area}</p>
                </div>
                <div>
                  <strong>{item.value}</strong>
                  <span>
                    <TrendingUp size={12} />
                    {item.delta}
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
