import { ArrowLeft } from "lucide-react";
import "../css/workout-history-header-card.css";

export default function WorkoutHistoryHeaderCard({ title, subtitle, pills = [], onBack, rightSlot }) {
  return (
    <header className="wh-header-card-wrap">
      <div className="wh-header-card">
        <div className="wh-header-card__top">
          {onBack ? (
            <button className="wh-header-card__back" onClick={onBack} aria-label="Go back">
              <ArrowLeft size={18} />
            </button>
          ) : (
            <span className="wh-header-card__spacer" />
          )}

          <div className="wh-header-card__title-block">
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>

          {rightSlot ? <div className="wh-header-card__right">{rightSlot}</div> : <span className="wh-header-card__spacer" />}
        </div>

        {pills.length ? (
          <div className="wh-header-card__pills">
            {pills.map((pill) => (
              <span key={pill}>{pill}</span>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}
