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
  const roleMode = canAccessAdmin ? "admin" : accountType;
  let gameReadyBannerHref = null;
  let gameReadyBannerLabel = null;
  const roleLabels = {
    admin: "Admin Mode",
    teacher: "Teacher Mode",
    student: "Student Mode",
    player: "Player Mode",
  };
  const roleLabel = user ? roleLabels[roleMode] || null : null;

  if (user && accountType === "student") {
    const { data: memberships } = await supabase
      .from("student_course_memberships")
      .select("course_id")
      .eq("profile_id", user.id);
    const courseIds = (memberships || []).map((membership) => membership.course_id).filter(Boolean);

    if (courseIds.length) {
      const candidates = [];
      const eightSecondsAgo = new Date(Date.now() - 8000).toISOString();
      const { data: readySession } = await supabase
        .from("double_board_sessions")
        .select("id, course_id")
        .in("course_id", courseIds)
        .in("status", ["waiting", "live"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (readySession?.id && readySession?.course_id) {
        const { data: dbTeacherPresence } = await supabase
          .from("double_board_players")
          .select("updated_at")
          .eq("session_id", readySession.id)
          .eq("role", "teacher")
          .gte("updated_at", eightSecondsAgo)
          .limit(1)
          .maybeSingle();

        if (dbTeacherPresence) {
          candidates.push({
            href: `/play/double-board?course=${readySession.course_id}`,
            label: "A Double Board game is ready - Join Now",
            updatedAt: dbTeacherPresence.updated_at,
          });
        }
      }

      const { data: lowestNumberWinsSession } = await supabase
        .from("lowest_number_wins_sessions")
        .select("id, course_id")
        .in("course_id", courseIds)
        .neq("status", "ended")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lowestNumberWinsSession?.id && lowestNumberWinsSession?.course_id) {
        const { data: lnwTeacherPresence } = await supabase
          .from("lowest_number_wins_players")
          .select("updated_at")
          .eq("session_id", lowestNumberWinsSession.id)
          .eq("role", "teacher")
          .gte("updated_at", eightSecondsAgo)
          .limit(1)
          .maybeSingle();

        if (lnwTeacherPresence) {
          candidates.push({
            href: `/play/lowest-number-wins?course=${lowestNumberWinsSession.course_id}`,
            label: "A Lowest Number Wins round is live - Join Now",
            updatedAt: lnwTeacherPresence.updated_at,
          });
        }
      }

      const { data: openMiddleSession } = await supabase
        .from("open_middle_sessions")
        .select("id, course_id")
        .in("course_id", courseIds)
        .eq("status", "live")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openMiddleSession?.id) {
        const { data: openMiddleTeacherPresence } = await supabase
          .from("open_middle_players")
          .select("updated_at")
          .eq("session_id", openMiddleSession.id)
          .eq("role", "teacher")
          .gte("updated_at", eightSecondsAgo)
          .limit(1)
          .maybeSingle();

        if (openMiddleTeacherPresence) {
          candidates.push({
            href: `/play/open-middle/${openMiddleSession.id}`,
            label: "An Open Middle puzzle is live - Join Now",
            updatedAt: openMiddleTeacherPresence.updated_at,
          });
        }
      }

      const readyCandidate = candidates.sort(
        (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      )[0];

      if (readyCandidate) {
        gameReadyBannerHref = readyCandidate.href;
        gameReadyBannerLabel = readyCandidate.label;
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
      { href: "/projector", label: "Projector" },
      { href: "/report-bug", label: "Report Bug" },
      { href: "/teachers", label: "Teachers" },
    ];
  }

  navItems = [...navItems].sort((a, b) => a.label.localeCompare(b.label));
  const logoutLabel = "Log Out";
  const navItemsBeforeLogout = user
    ? navItems.filter((item) => item.label.localeCompare(logoutLabel) < 0)
    : navItems;
  const navItemsAfterLogout = user
    ? navItems.filter((item) => item.label.localeCompare(logoutLabel) >= 0)
    : [];

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
                    width={440}
                    style={{ height: "clamp(32px, 3.5vw, 44px)", width: "auto" }}
                    priority
                  />
                </Link>
                {roleLabel ? <span className={`roleBadge ${roleMode ? `roleBadge--${roleMode}` : ""}`}>{roleLabel}</span> : null}
              </div>
              <div className="topbarNav">
                {navItemsBeforeLogout.length > 0 ? <AppNav items={navItemsBeforeLogout} /> : null}
                {user ? (
                  <form action={signOutAction} className="navForm topbarMenuForm">
                    <button className="navButton" type="submit">
                      Log Out
                    </button>
                  </form>
                ) : null}
                {navItemsAfterLogout.length > 0 ? <AppNav items={navItemsAfterLogout} /> : null}
              </div>
            </header>
            <GameReadyBanner href={gameReadyBannerHref} label={gameReadyBannerLabel} />
            <section className="content">{children}</section>
          </div>
        </main>
      </body>
    </html>
  );
}
