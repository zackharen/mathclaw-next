import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-config";

export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const { url, anonKey } = resolveSupabasePublicEnv(
    headerStore.get("x-forwarded-host") || headerStore.get("host")
  );

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Middleware handles refresh writes in SSR edge paths.
        }
      },
    },
  });
}
