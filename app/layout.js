import "./globals.css";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/actions";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { canAccessAdminArea } from "@/lib/auth/owner";
import AppNav from "./app-nav";

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
  const isTeacher = Boolean(user && accountType !== "student");
  const canAccessAdmin = Boolean(user && canAccessAdminArea(user));
  const roleLabel = accountType === "student" ? "Student Arcade" : user ? "Teacher Workspace" : null;

  let navItems = [];

  if (!user) {
    navItems = [
      { href: "/", label: "Home" },
      { href: "/auth/sign-in", label: "Log In" },
      { href: "/auth/sign-up", label: "Create Account" },
    ];
  } else if (accountType === "student") {
    navItems = [
      { href: "/play", label: "Arcade" },
      { href: "/onboarding/profile", label: "Profile" },
      { href: "/report-bug", label: "Report Bug" },
    ];
  } else {
    navItems = [
      { href: "/classes", label: "Classes" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/teachers", label: "Teachers" },
      { href: "/play", label: "Arcade" },
      { href: "/onboarding/profile", label: "Profile" },
      { href: "/report-bug", label: "Report Bug" },
    ];

    if (canAccessAdmin) {
      navItems.push({ href: "/admin", label: "Admin" });
    }
  }

  return (
    <html lang="en">
      <body>
        <main>
          <div className="shell">
            <header className="topbar">
              <div className="topbarBrand">
                <Link className="brand" href={accountType === "student" ? "/play" : user ? "/classes" : "/"}>
                  MathClaw
                </Link>
                {roleLabel ? <span className="roleBadge">{roleLabel}</span> : null}
              </div>
              <div className="topbarNav">
                <AppNav items={navItems} />
                {user ? (
                  <form action={signOutAction} className="navForm">
                    <button className="navButton" type="submit">
                      Log Out
                    </button>
                  </form>
                ) : null}
              </div>
            </header>
            <section className="content">{children}</section>
          </div>
        </main>
      </body>
    </html>
  );
}
