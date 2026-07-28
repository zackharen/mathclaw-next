// Shared placeholder shown while a route's server component streams in.
// Mirrors the app's card/stack layout so navigation feels instant.
export default function RouteSkeleton({ cards = 3, label = "Loading page…" }) {
  return (
    <div className="stack skeletonStack" aria-busy="true" aria-live="polite">
      <p className="srOnly">{label}</p>
      {Array.from({ length: cards }).map((_, index) => (
        <div className="skeletonCard" key={index} aria-hidden="true">
          <div className="skeletonLine skeletonTitle" />
          <div className="skeletonLine" style={{ width: "92%" }} />
          <div className="skeletonLine" style={{ width: "78%" }} />
        </div>
      ))}
    </div>
  );
}
