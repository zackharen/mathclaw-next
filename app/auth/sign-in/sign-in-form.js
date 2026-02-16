"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignInForm({ redirectTo }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  async function onEmailSignIn(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  async function onGoogleSignIn() {
    setLoading(true);
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
      setLoading(false);
      setError(googleError.message);
    }
  }

  return (
    <>
      <form onSubmit={onEmailSignIn} className="list" style={{ marginTop: "1rem" }}>
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
          <button className="btn primary" disabled={loading} type="submit">
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <button className="btn" disabled={loading} onClick={onGoogleSignIn} type="button">
            Continue with Google
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
