"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getAccountTypeForUser, sanitizeNextForAccountType } from "@/lib/auth/account-type";

export default function SignInForm({ redirectTo }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [activeMethod, setActiveMethod] = useState(null);

  const router = useRouter();

  async function onEmailSignIn(event) {
    event.preventDefault();
    setActiveMethod("email");
    setError("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setActiveMethod(null);
      setError(signInError.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const accountType = await getAccountTypeForUser(supabase, user, "teacher");

    router.push(sanitizeNextForAccountType(redirectTo, accountType));
    router.refresh();
  }

  async function onGoogleSignIn() {
    setActiveMethod("google");
    setError("");

    const origin = window.location.origin;
    const supabase = createClient();
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (googleError) {
      setActiveMethod(null);
      setError(googleError.message);
    }
  }

  return (
    <>
      <section className="authPriorityCard">
        <p className="authEyebrow">Best for students</p>
        <h2>Continue with Google</h2>
        <p>
          Use your school Google account first. It skips the confirmation-email step and is the
          fastest way into MathClaw.
        </p>
        <div className="ctaRow authPrimaryRow">
          <button
            className="btn primary googleBtn"
            disabled={activeMethod !== null}
            onClick={onGoogleSignIn}
            type="button"
          >
            {activeMethod === "google" ? "Opening Google..." : "Continue with Google"}
          </button>
        </div>
      </section>

      <div className="authDivider">
        <span>or use email/password</span>
      </div>

      <form onSubmit={onEmailSignIn} className="list authForm" style={{ marginTop: "1rem" }}>
        <label>
          Email
          <input
            style={inputStyle}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label>
          Password
          <input
            style={inputStyle}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error ? <p style={{ color: "#7f1d1d" }}>{error}</p> : null}

        <div className="ctaRow">
          <button className="btn" disabled={activeMethod !== null} type="submit">
            {activeMethod === "email" ? "Signing in..." : "Sign In with Email"}
          </button>
        </div>
      </form>

      <p style={{ marginTop: "1rem" }}>
        Need an account? <Link href="/auth/sign-up">Create one</Link>
      </p>
    </>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: "0.4rem",
  border: "1px solid #1f2937",
  borderRadius: "8px",
  padding: "0.55rem 0.65rem",
  font: "inherit",
  background: "#fff",
};
