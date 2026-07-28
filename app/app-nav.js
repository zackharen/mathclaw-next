"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLabel({ label }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? "navLabel navLabelPending" : "navLabel"}>
      {label}
    </span>
  );
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
          <NavLabel label={item.label} />
        </Link>
      ))}
    </nav>
  );
}
