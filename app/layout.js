import "./globals.css";
import { Suspense } from "react";
import GlobalHeader, { GlobalHeaderFallback } from "./global-header";

export const metadata = {
  title: "MathClaw",
  description: "Curriculum pacing, student games, and classroom tools.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main>
          <div className="shell">
            <Suspense fallback={<GlobalHeaderFallback />}>
              <GlobalHeader />
            </Suspense>
            <section className="content">{children}</section>
          </div>
        </main>
      </body>
    </html>
  );
}
