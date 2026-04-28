import Image from "next/image";
import { getSiteCopy } from "@/lib/site-config";

export default async function HomePage() {
  const siteCopy = await getSiteCopy();

  return (
    <div className="stack">
      {siteCopy.homeBanner ? (
        <section className="card" style={{ background: "#fff4d6", borderColor: "#cd3b3b" }}>
          <p style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{siteCopy.homeBanner}</p>
        </section>
      ) : null}

      <section className="card" style={{ textAlign: "center" }}>
        <Image
          src="/mathclaw-logo.png"
          alt="MathClaw"
          width={400}
          height={400}
          style={{ maxWidth: "100%", height: "auto" }}
          priority
        />
        <h1>{siteCopy.homeWelcome}</h1>
      </section>
    </div>
  );
}
