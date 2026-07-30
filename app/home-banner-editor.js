"use client";

import { useState, useTransition } from "react";
import { updateHomeBannerAction } from "@/app/admin/actions";
import styles from "./page.module.css";

export default function HomeBannerEditor({ initialValue, canEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue);
  const [state, setState] = useState({
    status: "idle",
    message: "",
    value: initialValue,
  });
  const [pending, startTransition] = useTransition();
  const value = state.value ?? initialValue;

  function beginEditing() {
    if (!canEdit || pending) return;
    setDraft(value);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(value);
    setEditing(false);
  }

  function saveBanner(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await updateHomeBannerAction(state, formData);
      setState(nextState);
      if (nextState.status === "success") {
        setDraft(nextState.value);
        setEditing(false);
      }
    });
  }

  if (!value && !canEdit) return null;

  return (
    <section
      className={`${styles.banner}${!value ? ` ${styles.bannerEmpty}` : ""}${canEdit ? ` ${styles.bannerEditable}` : ""}`}
      onDoubleClick={beginEditing}
      aria-label="MathClaw message banner"
    >
      <span className={styles.bannerDot} aria-hidden="true" />
      {editing ? (
        <form className={styles.bannerForm} onSubmit={saveBanner}>
          <label className={styles.bannerInputLabel}>
            <span>Edit banner message</span>
            <input
              name="home_banner"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelEditing();
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={240}
              autoFocus
            />
          </label>
          <div className={styles.bannerActions}>
            <button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={cancelEditing} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>{value || "Add a homepage banner message"}</p>
          {canEdit ? (
            <button className={styles.bannerEditButton} type="button" onClick={beginEditing}>
              Edit
            </button>
          ) : null}
        </>
      )}
      {state.message ? (
        <span
          className={`${styles.bannerFeedback}${state.status === "error" ? ` ${styles.bannerFeedbackError}` : ""}`}
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {state.message}
        </span>
      ) : null}
    </section>
  );
}
