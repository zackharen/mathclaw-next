// Where a plan form may send the teacher afterwards. Only this app's own class
// pages qualify; anything else (another origin, protocol-relative //host,
// backslash tricks, non-strings) returns the fallback, so a crafted form can't
// turn Mark Complete into an open redirect.
export function safeClassReturnPath(value, fallback = null) {
  const path = typeof value === "string" ? value : "";
  if (!path.startsWith("/classes/") || path.includes("//") || path.includes("\\")) return fallback;
  return path;
}
