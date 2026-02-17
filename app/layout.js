import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "MathClaw",
  description: "Curriculum pacing and announcements for math teachers.",
};

export default function RootLayout({ children }) {
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
                <Link href="/onboarding/profile">Profile</Link>
                <Link href="/classes">Classes</Link>
                <Link href="/classes/new">New Class</Link>
                <Link href="/dashboard">Dashboard</Link>
              </nav>
            </header>
            <section className="content">{children}</section>
          </div>
        </main>
      </body>
    </html>
  );
}
