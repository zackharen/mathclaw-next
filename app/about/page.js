import Image from "next/image";
import { getSiteCopy } from "@/lib/site-config";

export default async function AboutPage() {
  const siteCopy = await getSiteCopy();

  return (
    <div className="stack">
      <div className="aboutLogo">
        <Image
          src="/mathclaw-logo.png"
          alt="MathClaw"
          width={400}
          height={400}
          style={{ maxWidth: "100%", height: "auto" }}
          priority
        />
      </div>

      <section className="aboutGrid">
        <article className="card" style={{ background: "#fff" }}>
          <h1>{siteCopy.aboutSectionTitle}</h1>
          <p>{siteCopy.aboutStory}</p>
        </article>
        <article className="card" style={{ background: "#fff" }}>
          <h1>{siteCopy.missionSectionTitle}</h1>
          <p>{siteCopy.missionStatement}</p>
        </article>
      </section>
    </div>
  );
}
