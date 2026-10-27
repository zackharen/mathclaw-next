import "./globals.css";
import { Suspense } from "react";
import GlobalHeader, { GlobalHeaderFallback } from "./global-header";
import PageTransition from "./page-transition";
import { AppToaster } from "./components/Toasts";

export const metadata = {
  title: "MathClaw",
  description: "Curriculum pacing, student games, and classroom tools.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a className="skipLink" href="#main-content">
          Skip to main content
        </a>
        <main>
          <div className="shell">
            <Suspense fallback={<GlobalHeaderFallback />}>
              <GlobalHeader />
            </Suspense>
            <section className="content" id="main-content" tabIndex={-1}>
              <PageTransition>{children}</PageTransition>
            </section>
          </div>
        </main>
        <AppToaster />
      </body>
    </html>
  );
}
