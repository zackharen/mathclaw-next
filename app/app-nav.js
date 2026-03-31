"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppNav({ items }) {
  const pathname = usePathname();

  return (
    <nav className="nav">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={isActive(pathname, item.href) ? "active" : ""}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
