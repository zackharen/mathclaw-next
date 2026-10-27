"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import "./offline-banner.css";

function subscribe(callback) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const getOnline = () => navigator.onLine;
const getServerOnline = () => true;

// Shows a bar while the device has no connection and a toast when it returns.
export default function OfflineBanner() {
  const pathname = usePathname();
  const online = useSyncExternalStore(subscribe, getOnline, getServerOnline);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Back online.", { id: "connection" });
    }
  }, [online]);

  // The class-facing projector screen stays clean.
  if (online || pathname?.startsWith("/projector/screen")) return null;

  return (
    <div className="offlineBanner" role="status">
      <strong>You&apos;re offline.</strong> Keep this page open. Your work stays here and saves when the connection
      comes back.
    </div>
  );
}
