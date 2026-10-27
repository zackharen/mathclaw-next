"use client";

import { useEffect } from "react";
import { Toaster, toast } from "sonner";

// One toast region for the whole site (rendered in app/layout.js).
export function AppToaster() {
  return <Toaster position="bottom-right" richColors closeButton duration={4000} />;
}

// Shows a success message as a toast once when it appears on the page.
export function SuccessToast({ children }) {
  useEffect(() => {
    if (!children) return undefined;
    // Wait a tick so the Toaster (mounted later in the layout) is listening.
    const timer = setTimeout(() => {
      toast.success(children, { id: typeof children === "string" ? children : undefined });
    }, 0);
    return () => clearTimeout(timer);
  }, [children]);
  return null;
}

// Mirrors a changing status string (e.g. the projector's "Sent to ...") as a toast.
export function useStatusToast(message) {
  useEffect(() => {
    if (message) toast(message, { id: message });
  }, [message]);
}
