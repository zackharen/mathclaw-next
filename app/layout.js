import "./globals.css";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/actions";
import { getAccountTypeForUser } from "@/lib/auth/account-type";
import { isOwnerUser } from "@/lib/auth/owner";

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
  const isOwner = Boolean(user && isOwnerUser(user));

  return (
    <html lang="en">
      <body>
        <main>
          <div className="shell">
            <header className="topbar">
              {/* TODO: Replace text mark with a custom emblem. */}
              <Link className="brand" href={user && accountType === "student" ? "/play" : "/"}>
                MathClaw
              </Link>
              <nav className="nav">
                <Link href="/play">Play</Link>
                {user ? <Link href="/onboarding/profile">Profile</Link> : null}
                {isTeacher ? <Link href="/teachers">Teachers</Link> : null}
                {isTeacher ? <Link href="/classes">Classes</Link> : null}
                {isTeacher ? <Link href="/classes/new">New Class</Link> : null}
                {isTeacher ? <Link href="/dashboard">Dashboard</Link> : null}
                {isOwner ? <Link href="/admin">Admin</Link> : null}
                {user ? (
                  <form action={signOutAction} className="navForm">
                    <button className="navButton" type="submit">
                      Log Out
                    </button>
                  </form>
                ) : (
                  <>
                    <Link href="/auth/sign-in">Log In</Link>
                    <Link href="/auth/sign-up">Create Account</Link>
                  </>
                )}
              </nav>
            </header>
            <section className="content">{children}</section>
          </div>
        </main>
      </body>
    </html>
  );
}
