import { SuccessToast } from "./Toasts";

export function StatusNotice({ children, tone = "success" }) {
  const isError = tone === "error";

  // Success confirmations clear themselves; errors stay on the page.
  if (!isError) return <SuccessToast>{children}</SuccessToast>;

  return (
    <div
      className={`card feedbackPanel ${isError ? "noticeError" : "noticeSuccess"}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <span className="feedbackPanelIcon" aria-hidden="true">
        {isError ? "!" : "✓"}
      </span>
      <p>{children}</p>
    </div>
  );
}

export function EmptyState({ eyebrow = "Nothing here yet", title, description, action = null }) {
  return (
    <section className="feedbackEmptyState">
      <span className="feedbackEmptyGlyph" aria-hidden="true">＋</span>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="ctaRow">{action}</div> : null}
    </section>
  );
}
