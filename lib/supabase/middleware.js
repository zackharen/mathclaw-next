import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-config";

// 1000ms gives ~500ms margin under Vercel's 1500ms edge middleware wall-clock limit.
const AUTH_LOOKUP_TIMEOUT_MS = 1000;

function timeoutAfter(ms) {
  let timer;
  const promise = new Promise((resolve) => {
    timer = setTimeout(
      () => resolve({ data: { user: null }, error: new Error("Auth lookup timed out") }),
      ms
    );
  });
  promise.cancel = () => clearTimeout(timer);
  return promise;
}

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

    const timeout = timeoutAfter(AUTH_LOOKUP_TIMEOUT_MS);
    const {
      data: { user },
    } = await Promise.race([supabase.auth.getUser(), timeout]);
    timeout.cancel();

    return { response, user };
  } catch {
    return { response: NextResponse.next({ request }), user: null };
  }
}
