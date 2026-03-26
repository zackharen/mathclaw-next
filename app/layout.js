import "./globals.css";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/actions";

export const metadata = {
  title: "MathClaw",
  description: "Curriculum pacing and announcements for math teachers.",
};

export default async function RootLayout({ children }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body>
        <main>
          <div className="shell">
            <header className="topbar">
              {/* TODO: Replace text mark with a custom emblem. */}
              <Link className="brand" href="/">
                MathClaw
              </Link>
              <nav className="nav">
                <Link href="/play">Play</Link>
                <Link href="/onboarding/profile">Profile</Link>
                <Link href="/teachers">Teachers</Link>
                <Link href="/classes">Classes</Link>
                <Link href="/classes/new">New Class</Link>
                <Link href="/dashboard">Dashboard</Link>
                {user ? (
                  <form action={signOutAction} className="navForm">
                    <button className="navButton" type="submit">
                      Log Out
                    </button>
                  </form>
                ) : (
                  <Link href="/auth/sign-in">Log In</Link>
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
