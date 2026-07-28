"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  pendingLabel = "Working…",
  className = "btn",
  disabled = false,
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      className={`${className}${pending ? " isPending" : ""}`}
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled}
    >
      {pending ? <span className="buttonSpinner" aria-hidden="true" /> : null}
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </button>
  );
}
