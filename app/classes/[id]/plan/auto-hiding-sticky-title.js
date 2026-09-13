"use client";

import { useEffect, useRef, useState } from "react";

const TOP_REVEAL_DISTANCE = 24;
const DIRECTION_THRESHOLD = 3;

export default function AutoHidingStickyTitle({ children }) {
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollY = useRef(0);
  const frame = useRef(null);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function updateVisibility() {
      const currentScrollY = window.scrollY;
      const change = currentScrollY - lastScrollY.current;

      if (currentScrollY <= TOP_REVEAL_DISTANCE) {
        setIsHidden(false);
      } else if (change >= DIRECTION_THRESHOLD) {
        setIsHidden(true);
      } else if (change <= -DIRECTION_THRESHOLD) {
        setIsHidden(false);
      }

      lastScrollY.current = currentScrollY;
      frame.current = null;
    }

    function handleScroll() {
      if (frame.current === null) {
        frame.current = window.requestAnimationFrame(updateVisibility);
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current);
      }
    };
  }, []);

  return (
    <div
      className={`stack classPlanStickyTitle${isHidden ? " isScrollHidden" : ""}`}
      style={{ marginBottom: "1rem" }}
    >
      {children}
    </div>
  );
}
