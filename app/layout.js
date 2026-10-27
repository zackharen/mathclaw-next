import "./globals.css";
import { Suspense } from "react";
import GlobalHeader, { GlobalHeaderFallback } from "./global-header";
import PageTransition from "./page-transition";
import { AppToaster } from "./components/Toasts";
import OfflineBanner from "./components/OfflineBanner";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata = {
  metadataBase: new URL("https://www.mathclaw.com"),
  title: "MathClaw",
  description: "Curriculum pacing, student games, and classroom tools.",
  // Link previews in Classroom, Slack, texts, and email. The image is app/opengraph-image.png.
  openGraph: {
    siteName: "MathClaw",
    title: "MathClaw",
    description: "Curriculum pacing, student games, and classroom tools.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
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
        <OfflineBanner />
        <SpeedInsights />
      </body>
    </html>
  );
}
