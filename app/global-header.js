import Link from "next/link";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOutAction } from "@/app/auth/actions";
import {
  getAccountTypeForUser,
  isTeacherAccountType,
} from "@/lib/auth/account-type";
import { canAccessAdminArea } from "@/lib/auth/owner";
import AppNav from "./app-nav";
import GameReadyBanner from "./components/GameReadyBanner";

const PUBLIC_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/auth/sign-in", label: "Log In" },
  { href: "/auth/sign-up", label: "Create Account" },
];

function Brand({ roleLabel = null, roleMode = null }) {
  return (
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
      {roleLabel ? (
        <span className={`roleBadge ${roleMode ? `roleBadge--${roleMode}` : ""}`}>
          {roleLabel}
        </span>
      ) : null}
    </div>
  );
}

export function GlobalHeaderFallback() {
  return (
    <header className="topbar">
      <Brand />
    </header>
  );
}

async function loadGameReadyBanner(userId) {
  const supabase = createAdminClient();
  const { data: memberships } = await supabase
    .from("student_course_memberships")
    .select("course_id")
    .eq("profile_id", userId);
  const courseIds = (memberships || []).map((membership) => membership.course_id).filter(Boolean);

  if (!courseIds.length) return null;

  const [{ data: doubleBoard }, { data: lowestNumberWins }, { data: openMiddle }] =
    await Promise.all([
      supabase
        .from("double_board_sessions")
        .select("id, course_id")
        .in("course_id", courseIds)
        .in("status", ["waiting", "live"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("lowest_number_wins_sessions")
        .select("id, course_id")
        .in("course_id", courseIds)
        .neq("status", "ended")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("open_middle_sessions")
        .select("id, course_id")
        .in("course_id", courseIds)
        .eq("status", "live")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const eightSecondsAgo = new Date(Date.now() - 8000).toISOString();
  const [doubleBoardPresence, lowestNumberWinsPresence, openMiddlePresence] = await Promise.all([
    doubleBoard?.id
      ? supabase
          .from("double_board_players")
          .select("updated_at")
          .eq("session_id", doubleBoard.id)
          .eq("role", "teacher")
          .gte("updated_at", eightSecondsAgo)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    lowestNumberWins?.id
      ? supabase
          .from("lowest_number_wins_players")
          .select("updated_at")
          .eq("session_id", lowestNumberWins.id)
          .eq("role", "teacher")
          .gte("updated_at", eightSecondsAgo)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    openMiddle?.id
      ? supabase
          .from("open_middle_players")
          .select("updated_at")
          .eq("session_id", openMiddle.id)
          .eq("role", "teacher")
          .gte("updated_at", eightSecondsAgo)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return [
    doubleBoardPresence.data && doubleBoard?.course_id
      ? {
          href: `/play/double-board?course=${doubleBoard.course_id}`,
          label: "A Double Board game is ready - Join Now",
          updatedAt: doubleBoardPresence.data.updated_at,
        }
      : null,
    lowestNumberWinsPresence.data && lowestNumberWins?.course_id
      ? {
          href: `/play/lowest-number-wins?course=${lowestNumberWins.course_id}`,
          label: "A Lowest Number Wins round is live - Join Now",
          updatedAt: lowestNumberWinsPresence.data.updated_at,
        }
      : null,
    openMiddlePresence.data && openMiddle?.id
      ? {
          href: `/play/open-middle/${openMiddle.id}`,
          label: "An Open Middle puzzle is live - Join Now",
          updatedAt: openMiddlePresence.data.updated_at,
        }
      : null,
  ]
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] || null;
}

const getCachedGameReadyBanner = unstable_cache(
  loadGameReadyBanner,
  ["student-game-ready-banner-v1"],
  { revalidate: 3 }
);

export default async function GlobalHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountType = user ? await getAccountTypeForUser(supabase, user) : null;
  const isTeacher = Boolean(user && isTeacherAccountType(accountType));
  const canAccessAdmin = Boolean(user && canAccessAdminArea(user));
  const roleMode = canAccessAdmin ? "admin" : accountType;
  const roleLabel = user
    ? {
        admin: "Admin Mode",
        teacher: "Teacher Mode",
        student: "Student Mode",
        player: "Player Mode",
      }[roleMode] || null
    : null;
  const readyGame = user && accountType === "student"
    ? await getCachedGameReadyBanner(user.id)
    : null;

  let navItems = PUBLIC_NAV_ITEMS;
  if (user && !isTeacher) {
    navItems = [
      { href: "/about", label: "About" },
      { href: "/play", label: "Arcade" },
      { href: "/onboarding/profile", label: "Profile" },
      { href: "/report-bug", label: "Report Bug" },
    ];
  } else if (user) {
    navItems = [
      { href: "/about", label: "About" },
      ...(canAccessAdmin ? [{ href: "/admin", label: "Admin" }] : []),
      { href: "/play", label: "Arcade" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/onboarding/profile", label: "Profile" },
      { href: "/projector", label: "Projector" },
      { href: "/report-bug", label: "Report Bug" },
      { href: "/teachers", label: "Teachers" },
    ];
  }

  navItems = [...navItems].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      <header className="topbar">
        <Brand roleLabel={roleLabel} roleMode={roleMode} />
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
      <GameReadyBanner href={readyGame?.href} label={readyGame?.label} />
    </>
  );
}
