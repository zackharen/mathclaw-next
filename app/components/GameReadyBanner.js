"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function GameReadyBanner({ href, label }) {
  const pathname = usePathname();

  if (
    !href ||
    ["/play/double-board", "/play/lowest-number-wins", "/play/open-middle"].some((path) =>
      pathname?.startsWith(path)
    )
  ) {
    return null;
  }

  return (
    <Link className="gameReadyBanner" href={href}>
      {label || "A group activity is live - Join Now"}
    </Link>
  );
}
