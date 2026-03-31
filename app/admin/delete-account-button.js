"use client";

export default function DeleteAccountButton({ disabled = false, label = "Delete Account" }) {
  return (
    <button
      className="btn danger"
      type="submit"
      disabled={disabled}
      onClick={(event) => {
        if (disabled) return;
        if (!window.confirm("Are you sure you want to delete this account? You can restore it later from Deleted Accounts.")) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
