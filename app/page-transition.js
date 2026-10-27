"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";
import "./page-transition.css";

// Cross-fades the page area when the path changes. Keyed by path so refreshes,
// query-string changes and in-page transitions never animate. Projector screens
// are displays, so they are left alone. Browsers without View Transitions, and
// reduced-motion users (see the CSS), just swap pages as before.
export default function PageTransition({ children }) {
  const pathname = usePathname() || "/";

  if (pathname.startsWith("/projector/screen")) return children;

  return (
    <ViewTransition key={pathname} default="none" enter="mc-page" exit="mc-page">
      {children}
    </ViewTransition>
  );
}
