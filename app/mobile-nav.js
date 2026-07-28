"use client";

import { useEffect, useId, useRef, useState } from "react";
import { signOutAction } from "@/app/auth/actions";
import AppNav from "./app-nav";

export default function MobileNav({ items, isAuthenticated }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <div className={`mobileNav ${open ? "isOpen" : ""}`} ref={menuRef}>
      <button
        ref={triggerRef}
        className="mobileNavTrigger"
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="mobileNavTriggerLabel">Menu</span>
        <span className="mobileNavIcon" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
      <div className="mobileNavPanel" id={menuId} hidden={!open}>
        <AppNav
          items={items}
          ariaLabel="Mobile navigation"
          onNavigate={closeMenu}
        />
        {isAuthenticated ? (
          <form action={signOutAction} className="navForm mobileNavLogout">
            <button className="navButton" type="submit">
              Log Out
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
