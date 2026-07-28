import "../styles.css";

// The receiver is a full-bleed dark stage with one centered join card, not the
// teacher studio. Without this, /projector/screen inherits app/projector/loading.js
// and a classroom screen briefly shows a studio skeleton announcing the wrong page.
export default function Loading() {
  return (
    <div className="projectorScreenLoading" aria-busy="true" aria-live="polite">
      <p className="srOnly">Loading projector screen…</p>
      <div className="projectorScreenLoadingCard" aria-hidden="true">
        <div className="skeletonLine" style={{ width: "45%" }} />
        <div className="skeletonLine skeletonTitle" style={{ width: "70%" }} />
        <div className="skeletonLine" style={{ width: "35%" }} />
        <div className="projectorScreenLoadingGrid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="projectorScreenLoadingTile" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
