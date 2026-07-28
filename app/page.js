import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  buildDefaultDisplayName,
  getAccountTypeForUser,
  isTeacherAccountType,
} from "@/lib/auth/account-type";
import { canAccessAdminArea } from "@/lib/auth/owner";
import { getSiteCopy } from "@/lib/site-config";
import styles from "./page.module.css";

const PUBLIC_FEATURES = [
  {
    eyebrow: "Plan",
    title: "Keep every class moving",
    copy: "Build pacing plans, organize classes, and see what needs attention without juggling separate tools.",
    tone: "blue",
  },
  {
    eyebrow: "Play",
    title: "Turn practice into momentum",
    copy: "Give students focused skill practice, strategy games, and live group activities in one arcade.",
    tone: "red",
  },
  {
    eyebrow: "Project",
    title: "Run the whole room",
    copy: "Coordinate projectors, tablets, polls, timers, drawings, and student work from one live control center.",
    tone: "gold",
  },
];

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

function PublicHome({ siteCopy }) {
  return (
    <div className={styles.home}>
      {siteCopy.homeBanner ? (
        <section className={styles.banner}>
          <span className={styles.bannerDot} aria-hidden="true" />
          <p>{siteCopy.homeBanner}</p>
        </section>
      ) : null}

      <section className={styles.publicHero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Math practice that runs with the room</p>
          <h1>{siteCopy.homeWelcome}</h1>
          <p className={styles.heroLead}>{siteCopy.homeIntro}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/auth/sign-up">
              Create an account <Arrow />
            </Link>
            <Link className={styles.secondaryAction} href="/auth/sign-in">
              Log in
            </Link>
          </div>
          <div className={styles.proofRow} aria-label="MathClaw product highlights">
            <span>Teacher planning</span>
            <span>Live classroom tools</span>
            <span>Student games</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="MathClaw classroom activity preview">
          <div className={styles.logoHalo}>
            <Image
              src="/mathclaw-logo.png"
              alt="MathClaw"
              width={400}
              height={400}
              priority
            />
          </div>
          <div className={`${styles.floatCard} ${styles.floatCardTop}`}>
            <span className={styles.liveDot} aria-hidden="true" />
            <div>
              <strong>Projector live</strong>
              <small>5 screens connected</small>
            </div>
          </div>
          <div className={`${styles.floatCard} ${styles.floatCardBottom}`}>
            <span className={styles.progressMark} aria-hidden="true">82%</span>
            <div>
              <strong>Class momentum</strong>
              <small>Students are on pace</small>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.featureSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>One connected classroom</p>
          <h2>Plan it. Play it. Put it on every screen.</h2>
        </div>
        <div className={styles.featureGrid}>
          {PUBLIC_FEATURES.map((feature, index) => (
            <article
              className={`${styles.featureCard} ${styles[`featureCard${feature.tone}`]}`}
              key={feature.title}
            >
              <div className={styles.featureNumber}>0{index + 1}</div>
              <p>{feature.eyebrow}</p>
              <h3>{feature.title}</h3>
              <span>{feature.copy}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function getWorkspaceActions({ isTeacher, canAccessAdmin }) {
  if (!isTeacher) {
    return [
      {
        href: "/play",
        label: "Open Arcade",
        title: "Choose your next challenge",
        copy: "Practice a skill, join a live activity, or pick up where you left off.",
        tone: "red",
      },
      {
        href: "/onboarding/profile",
        label: "View Profile",
        title: "Make MathClaw yours",
        copy: "Update your name, account details, and classroom connections.",
        tone: "blue",
      },
      {
        href: "/play/integer-practice",
        label: "Keep Practicing",
        title: "Build your math momentum",
        copy: "Jump straight into adaptive integer practice and keep progressing.",
        tone: "gold",
      },
    ];
  }

  return [
    {
      href: "/dashboard",
      label: "Open Dashboard",
      title: "Check class pacing",
      copy: "See which classes are on pace and where your plan needs attention.",
      tone: "blue",
    },
    {
      href: "/projector",
      label: "Run Projector",
      title: "Take control of the room",
      copy: "Send content, launch a poll, start a timer, or restore a saved scene.",
      tone: "red",
    },
    {
      href: "/play",
      label: "Launch Activity",
      title: "Get students playing",
      copy: "Open a group activity, strategy game, or independent practice mode.",
      tone: "gold",
    },
    {
      href: canAccessAdmin ? "/admin" : "/classes",
      label: canAccessAdmin ? "Open Admin" : "Manage Classes",
      title: canAccessAdmin ? "Manage MathClaw" : "Set up your classes",
      copy: canAccessAdmin
        ? "Review accounts, feature rollouts, site copy, and diagnostics."
        : "Create classes, update rosters, and prepare the next lesson.",
      tone: "slate",
    },
  ];
}

function SignedInHome({ siteCopy, user, accountType, canAccessAdmin }) {
  const displayName = buildDefaultDisplayName(user);
  const firstName = displayName.split(/\s+/)[0] || "there";
  const isTeacher = isTeacherAccountType(accountType);
  const actions = getWorkspaceActions({ isTeacher, canAccessAdmin });
  const modeLabel = canAccessAdmin
    ? "Admin workspace"
    : isTeacher
      ? "Teacher workspace"
      : accountType === "player"
        ? "Player workspace"
        : "Student workspace";

  return (
    <div className={styles.home}>
      {siteCopy.homeBanner ? (
        <section className={styles.banner}>
          <span className={styles.bannerDot} aria-hidden="true" />
          <p>{siteCopy.homeBanner}</p>
        </section>
      ) : null}

      <section className={styles.todayHero}>
        <div className={styles.todayCopy}>
          <div className={styles.todayMeta}>
            <span className={styles.modePill}>{modeLabel}</span>
            <span className={styles.todayStatus}>
              <span className={styles.liveDot} aria-hidden="true" />
              Ready when you are
            </span>
          </div>
          <p className={styles.eyebrow}>MathClaw Today</p>
          <h1>Welcome back, {firstName}.</h1>
          <p className={styles.heroLead}>
            {isTeacher
              ? "Everything you need to plan, play, and run the room is ready from here."
              : "Your games, practice, and live class activities are ready when you are."}
          </p>
          <Link
            className={styles.primaryAction}
            href={isTeacher ? "/projector" : "/play"}
          >
            {isTeacher ? "Run the room" : "Start playing"} <Arrow />
          </Link>
        </div>
        <div className={styles.todayVisual} aria-hidden="true">
          <div className={styles.orbit}>
            <Image
              src="/mathclaw-logo.png"
              alt=""
              width={260}
              height={260}
              priority
            />
          </div>
          <span className={`${styles.spark} ${styles.sparkOne}`} />
          <span className={`${styles.spark} ${styles.sparkTwo}`} />
          <span className={`${styles.spark} ${styles.sparkThree}`} />
        </div>
      </section>

      <section className={styles.workspaceSection}>
        <div className={styles.workspaceHeading}>
          <div>
            <p className={styles.eyebrow}>Quick launch</p>
            <h2>Where do you want to go?</h2>
          </div>
          <p>One click gets you back into the work that matters now.</p>
        </div>
        <div className={styles.actionGrid}>
          {actions.map((action) => (
            <Link
              className={`${styles.actionCard} ${styles[`actionCard${action.tone}`]}`}
              href={action.href}
              key={action.href}
            >
              <span className={styles.actionLabel}>{action.label}</span>
              <h3>{action.title}</h3>
              <p>{action.copy}</p>
              <span className={styles.actionArrow} aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.momentumStrip}>
        <div>
          <p className={styles.eyebrow}>Built for momentum</p>
          <h2>Less hunting. More teaching and playing.</h2>
        </div>
        <div className={styles.momentumSteps}>
          <span><strong>01</strong> Plan</span>
          <span><strong>02</strong> Launch</span>
          <span><strong>03</strong> Respond live</span>
        </div>
      </section>
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const [siteCopy, authResult] = await Promise.all([
    getSiteCopy(),
    supabase.auth.getUser(),
  ]);
  const user = authResult.data.user;

  if (!user) {
    return <PublicHome siteCopy={siteCopy} />;
  }

  const accountType = await getAccountTypeForUser(supabase, user);

  return (
    <SignedInHome
      siteCopy={siteCopy}
      user={user}
      accountType={accountType}
      canAccessAdmin={canAccessAdminArea(user)}
    />
  );
}
