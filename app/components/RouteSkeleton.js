// Shared placeholder shown while a route's server component streams in.
// Mirrors the app's card/stack layout so navigation feels instant.
export default function RouteSkeleton({ cards = 3 }) {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      {Array.from({ length: cards }).map((_, index) => (
        <div className="skeletonCard" key={index}>
          <div className="skeletonLine skeletonTitle" />
          <div className="skeletonLine" style={{ width: "92%" }} />
          <div className="skeletonLine" style={{ width: "78%" }} />
        </div>
      ))}
    </div>
  );
}
