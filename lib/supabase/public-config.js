const PRODUCTION_APP_HOSTS = new Set(["www.mathclaw.com", "mathclaw.com"]);
const STAGING_SUPABASE_URL = "https://ddcjzyviksvblfxuzxpa.supabase.co";
const PRODUCTION_SUPABASE_URL = "https://ruaaznacaywngewxyged.supabase.co";
const PRODUCTION_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1YWF6bmFjYXl3bmdld3h5Z2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMTk3NDYsImV4cCI6MjA4Njc5NTc0Nn0.2bJSVUgqXfJ4yd2vD3MLkeR0tIjYggrl6jqVD6dWrHM";

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

export function resolveSupabasePublicEnv(hostname) {
  const fallbackUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const fallbackAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const normalizedHostname = normalizeHostname(hostname);

  if (
    PRODUCTION_APP_HOSTS.has(normalizedHostname) &&
    fallbackUrl === STAGING_SUPABASE_URL
  ) {
    return {
      url: PRODUCTION_SUPABASE_URL,
      anonKey: PRODUCTION_SUPABASE_ANON_KEY,
    };
  }

  return {
    url: fallbackUrl,
    anonKey: fallbackAnonKey,
  };
}
