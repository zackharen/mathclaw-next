import Link from "next/link";

export function GameShell({
  eyebrow,
  title,
  description,
  icon,
  tone = "blue",
  badges = [],
  children,
}) {
  return (
    <div className={`gameExperience is-${tone}`}>
      <header className="gameExperienceHero">
        <div className="gameExperienceHeroCopy">
          <nav className="gameExperienceBreadcrumbs" aria-label="Game navigation">
            <Link href="/play">← Arcade</Link>
            <span aria-hidden="true">/</span>
            <span>{title}</span>
          </nav>
          <p className="gameExperienceEyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="gameExperienceDescription">{description}</p>
          {badges.length > 0 ? (
            <div className="gameExperienceBadges" aria-label="Game details">
              {badges.map((badge) => (
                <span key={badge}>{badge}</span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="gameExperienceMark" aria-hidden="true">
          <span>{icon}</span>
          <small>MathClaw Arcade</small>
        </div>
      </header>
      {children}
    </div>
  );
}

export function GameWorkspace({ children, className = "" }) {
  return <div className={`gameWorkspace ${className}`.trim()}>{children}</div>;
}

export function GameStage({
  eyebrow,
  title,
  status = "Run in progress",
  progress,
  progressLabel,
  stats = [],
  children,
}) {
  return (
    <section className="gameStage" aria-labelledby="game-stage-title">
      <div className="gameStageHeader">
        <div>
          <p className="gameStageEyebrow">{eyebrow}</p>
          <h2 id="game-stage-title">{title}</h2>
        </div>
        <span className="gameStageStatus">
          <i aria-hidden="true" />
          {status}
        </span>
      </div>
      <div className="gameRunMeter" aria-label={progressLabel}>
        <div>
          <span>{progressLabel}</span>
          <strong>{Math.round(progress)}%</strong>
        </div>
        <span className="gameRunMeterTrack">
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </span>
      </div>
      {stats.length > 0 ? (
        <div className="gameLiveStats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function GameSidePanel({ eyebrow, title, children, id }) {
  return (
    <section className="gameSidePanel" id={id}>
      <p className="gameSidePanelEyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function GameResults({
  eyebrow = "Run complete",
  title,
  message,
  stats = [],
  actionLabel,
  onAction,
  actionDisabled = false,
  statusMessage = "",
}) {
  return (
    <section className="gameResults" aria-live="polite">
      <div className="gameResultsBurst" aria-hidden="true">✓</div>
      <p className="gameResultsEyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="gameResultsMessage">{message}</p>
      <div className="gameResultsStats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>
      <div className="gameResultsActions">
        <button
          className="btn primary"
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
        >
          {actionLabel}
        </button>
        <Link className="btn" href="/play">Choose Another Game</Link>
      </div>
      {statusMessage ? <p className="gameResultsSaveStatus">{statusMessage}</p> : null}
    </section>
  );
}
