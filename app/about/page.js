import Link from "next/link";
import { getSiteCopy } from "@/lib/site-config";

export default async function AboutPage() {
  const siteCopy = await getSiteCopy();

  return (
    <div className="stack">
      <section className="card">
        <h1>{siteCopy.aboutTitle}</h1>
        <p>{siteCopy.missionStatement}</p>
      </section>

      <section className="featureGrid">
        <article className="card" style={{ background: "#fff" }}>
          <h2>Mission</h2>
          <p>{siteCopy.missionStatement}</p>
        </article>
        <article className="card" style={{ background: "#fff" }}>
          <h2>What MathClaw Tries To Do</h2>
          <p>{siteCopy.aboutStory}</p>
        </article>
      </section>

      <section className="card">
        <h2>Where It Fits</h2>
        <p>
          MathClaw is built for classroom planning, student skill practice, performance tasks, and live group review.
          The goal is to make those parts of math class easier to launch and easier to improve over time.
        </p>
        <div className="ctaRow">
          <Link className="btn primary" href="/">
            Back Home
          </Link>
          <Link className="btn" href="/play">
            Open Arcade
          </Link>
        </div>
      </section>
    </div>
  );
}
