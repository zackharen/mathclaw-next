import { NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

const PROTECTED_PREFIXES = ["/onboarding", "/classes", "/dashboard"];

export async function middleware(request) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  const isAuthPath = pathname.startsWith("/auth/sign-in") || pathname.startsWith("/auth/sign-up");

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.searchParams.set("redirect", `${pathname}${search || ""}`);
    return NextResponse.redirect(url);
  }

  if (isAuthPath && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/classes";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
