"use client";

import { useEffect, useState } from "react";

export default function AdminToast({ message, action }) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setVisible(false), 10000);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message || !visible) return null;

  return (
    <div className="adminToast" role="status" aria-live="polite">
      <p>{message}</p>
      {action}
    </div>
  );
}
