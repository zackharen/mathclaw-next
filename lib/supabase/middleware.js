import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-config";

export async function updateSession(request) {
  const { url, anonKey } = resolveSupabasePublicEnv(request.nextUrl.hostname);

  // Allow app pages to load before env vars are configured in deployment.
  if (!url || !anonKey) {
    return { response: NextResponse.next({ request }), user: null };
  }

  try {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          } catch {
            // If a specific browser sends back a bad or locked cookie state,
            // we still want the request to continue as an anonymous session.
          }

          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    return { response, user };
  } catch {
    return { response: NextResponse.next({ request }), user: null };
  }
}
