export function getOwnerEmails() {
  return String(process.env.MATHCLAW_OWNER_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email) {
  if (!email) return false;
  return getOwnerEmails().includes(String(email).trim().toLowerCase());
}

export function isAdminUser(user) {
  return Boolean(user?.app_metadata?.site_admin);
}

export function isOwnerUser(user) {
  return isOwnerEmail(user?.email || "") || isAdminUser(user);
}
