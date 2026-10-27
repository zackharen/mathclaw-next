"use client";

import { useEffect, useRef } from "react";
import { FocusScope } from "@radix-ui/react-focus-scope";

// Open modals, newest last, so Escape only closes the top one.
const openModals = [];

// Wrap a modal's dialog element: keeps Tab inside it, moves focus in on open and
// back to the opener on close, closes on Escape, and stops the page behind it
// from scrolling. Pass onClose={undefined} while closing is not allowed.
export default function ModalFocus({ onClose, children }) {
  const token = useRef({});
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const id = token.current;
    openModals.push(id);
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key !== "Escape" || openModals[openModals.length - 1] !== id) return;
      if (!closeRef.current) return;
      event.preventDefault();
      closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openModals.splice(openModals.indexOf(id), 1);
      body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <FocusScope asChild trapped loop>
      {children}
    </FocusScope>
  );
}
