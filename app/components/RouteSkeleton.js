// Shared placeholder shown while a route's server component streams in.
// Mirrors the app's card/stack layout so navigation feels instant.
//
// `hero` and `stats` reproduce the workspace hero + stat strip used by the
// modernized teacher surfaces, so the skeleton occupies roughly the space the
// real page will instead of shifting the layout when content arrives.
export default function RouteSkeleton({
  cards = 3,
  label = "Loading page…",
  hero = false,
  stats = 0,
  columns = 1,
  tone = "light",
}) {
  return (
    <div
      className={`stack skeletonStack${tone === "dark" ? " skeletonStackDark" : ""}`}
      aria-busy="true"
      aria-live="polite"
    >
      <p className="srOnly">{label}</p>

      {hero ? (
        <div className="skeletonHero" aria-hidden="true">
          <div className="skeletonHeroCopy">
            <div className="skeletonLine skeletonEyebrow" />
            <div className="skeletonLine skeletonHeroTitle" />
            <div className="skeletonLine" style={{ width: "88%" }} />
            <div className="skeletonHeroActions">
              <div className="skeletonPill" />
              <div className="skeletonPill" />
            </div>
          </div>
          {stats > 0 ? (
            <div className="skeletonStatGrid">
              {Array.from({ length: stats }).map((_, index) => (
                <div className="skeletonStat" key={index}>
                  <div className="skeletonLine skeletonStatValue" />
                  <div className="skeletonLine skeletonStatLabel" />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={columns > 1 ? "skeletonGrid" : "skeletonList"}>
        {Array.from({ length: cards }).map((_, index) => (
          <div className="skeletonCard" key={index} aria-hidden="true">
            <div className="skeletonLine skeletonTitle" />
            <div className="skeletonLine" style={{ width: "92%" }} />
            <div className="skeletonLine" style={{ width: "78%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
