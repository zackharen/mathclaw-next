"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function GameReadyBanner({ href }) {
  const pathname = usePathname();

  if (!href || pathname?.startsWith("/play/double-board")) {
    return null;
  }

  return (
    <Link className="gameReadyBanner" href={href}>
      A Double Board game is ready - Join Now
    </Link>
  );
}
