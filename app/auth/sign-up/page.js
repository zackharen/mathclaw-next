"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);


  async function onSignUp(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const origin = window.location.origin;
    const supabase = createClient();

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/onboarding/profile`,
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setMessage("Check your email to confirm your account, then continue.");
  }

  async function onGoogleSignUp() {
    setLoading(true);
    setError("");
    setMessage("");

    const origin = window.location.origin;
    const supabase = createClient();
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=/onboarding/profile`,
      },
    });

    if (googleError) {
      setLoading(false);
      setError(googleError.message);
    }
  }

  return (
    <div className="stack">
      <section className="card authCardShell">
        <h1>Create Account</h1>
        <p>Students should use Google first. Email/password stays available as a backup option.</p>

        <section className="authPriorityCard" style={{ marginTop: "1rem" }}>
          <p className="authEyebrow">Recommended</p>
          <h2>Continue with Google</h2>
          <p>Use your school Google account to skip confirmation emails and get into MathClaw faster.</p>
          <div className="ctaRow authPrimaryRow">
            <button className="btn primary googleBtn" disabled={loading} onClick={onGoogleSignUp} type="button">
              {loading ? "Opening Google..." : "Continue with Google"}
            </button>
          </div>
        </section>

        <div className="authDivider">
          <span>or create an account with email</span>
        </div>

        <form onSubmit={onSignUp} className="list authForm" style={{ marginTop: "1rem" }}>
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>

          {error ? <p style={{ color: "#7f1d1d" }}>{error}</p> : null}
          {message ? <p style={{ color: "#14532d" }}>{message}</p> : null}

          <div className="ctaRow">
            <button className="btn" disabled={loading} type="submit">
              {loading ? "Creating..." : "Create Account with Email"}
            </button>
          </div>
        </form>

        <p style={{ marginTop: "1rem" }}>
          Already have an account? <Link href="/auth/sign-in">Sign in</Link>
        </p>
      </section>
    </div>
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
