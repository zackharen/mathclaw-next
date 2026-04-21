import { createBrowserClient } from "@supabase/ssr";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-config";

export function createClient() {
  const { url, anonKey } = resolveSupabasePublicEnv(window.location.hostname);
  return createBrowserClient(url, anonKey);
}
