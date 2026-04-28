import "./globals.css";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/actions";
import {
  getAccountTypeForUser,
  isTeacherAccountType,
} from "@/lib/auth/account-type";
import { canAccessAdminArea } from "@/lib/auth/owner";
import AppNav from "./app-nav";
import GameReadyBanner from "./components/GameReadyBanner";

export const metadata = {
  title: "MathClaw",
  description: "Curriculum pacing, student games, and classroom tools.",
};

export default async function RootLayout({ children }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountType = user ? await getAccountTypeForUser(supabase, user) : null;
  const isTeacher = Boolean(user && isTeacherAccountType(accountType));
  const canAccessAdmin = Boolean(user && canAccessAdminArea(user));
  let gameReadyBannerHref = null;
  const roleLabel =
    accountType === "teacher"
      ? "Teacher Workspace"
      : user
        ? "Arcade"
        : null;

  if (user && accountType === "student") {
    const { data: memberships } = await supabase
      .from("student_course_memberships")
      .select("course_id")
      .eq("profile_id", user.id);
    const courseIds = (memberships || []).map((membership) => membership.course_id).filter(Boolean);

    if (courseIds.length) {
      const { data: readySession } = await supabase
        .from("double_board_sessions")
        .select("course_id")
        .in("course_id", courseIds)
        .in("status", ["waiting", "live"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (readySession?.course_id) {
        gameReadyBannerHref = `/play/double-board?course=${readySession.course_id}`;
      }
    }
  }

  let navItems = [];

  if (!user) {
    navItems = [
      { href: "/", label: "Home" },
      { href: "/about", label: "About" },
      { href: "/auth/sign-in", label: "Log In" },
      { href: "/auth/sign-up", label: "Create Account" },
    ];
  } else if (!isTeacher) {
    navItems = [
      { href: "/about", label: "About" },
      { href: "/play", label: "Arcade" },
      { href: "/onboarding/profile", label: "Profile" },
      { href: "/report-bug", label: "Report Bug" },
    ];
  } else {
    navItems = [
      { href: "/about", label: "About" },
      ...(canAccessAdmin ? [{ href: "/admin", label: "Admin" }] : []),
      { href: "/play", label: "Arcade" },
      { href: "/classes", label: "Classes" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/onboarding/profile", label: "Profile" },
      { href: "/report-bug", label: "Report Bug" },
      { href: "/teachers", label: "Teachers" },
    ];
  }

  return (
    <html lang="en">
      <body>
        <main>
          <div className="shell">
            <header className="topbar">
              <div className="topbarBrand">
                <Link className="brand" href="/" style={{ lineHeight: 0 }}>
                  <Image
                    src="/mathclaw-logo-nav.png"
                    alt="MathClaw"
                    height={44}
                    width={220}
                    style={{ height: "clamp(32px, 3.5vw, 44px)", width: "auto" }}
                    priority
                  />
                </Link>
                {roleLabel ? <span className="roleBadge">{roleLabel}</span> : null}
              </div>
              <div className="topbarNav">
                <AppNav items={navItems} />
                {user ? (
                  <form action={signOutAction} className="navForm topbarMenuForm">
                    <button className="navButton" type="submit">
                      Log Out
                    </button>
                  </form>
                ) : null}
              </div>
            </header>
            <GameReadyBanner href={gameReadyBannerHref} />
            <section className="content">{children}</section>
          </div>
        </main>
      </body>
    </html>
  );
}
