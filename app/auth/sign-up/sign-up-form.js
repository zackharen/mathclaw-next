"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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

function buildCallbackUrl(origin, { next, accountType, schoolName, joinCode }) {
  const params = new URLSearchParams({
    next,
    account_type: accountType,
    school_name: schoolName,
  });

  if (joinCode) {
    params.set("join_code", joinCode);
  }

  return `${origin}/auth/callback?${params.toString()}`;
}

export default function SignUpForm({ schoolOptions = [] }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState("");
  const [selectedSchoolName, setSelectedSchoolName] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeMethod, setActiveMethod] = useState("");

  const roleLabel = useMemo(() => {
    if (accountType === "teacher") return "Teacher";
    if (accountType === "student") return "Student";
    return "";
  }, [accountType]);

  const resolvedSchoolName = useMemo(
    () => newSchoolName.trim() || selectedSchoolName,
    [newSchoolName, selectedSchoolName]
  );
  const isBusy = activeMethod !== "";

  async function onSignUp(event) {
    event.preventDefault();
    if (!accountType) {
      setError("Choose whether you're creating a teacher or student account first.");
      return;
    }
    if (!resolvedSchoolName) {
      setError("Choose an existing school or type a new one.");
      return;
    }

    setActiveMethod("email");
    setError("");
    setMessage("");

    const origin = window.location.origin;
    const supabase = createClient();
    const next = accountType === "student" ? "/play" : "/classes";
    const callbackUrl = buildCallbackUrl(origin, {
      next,
      accountType,
      schoolName: resolvedSchoolName,
      joinCode: accountType === "student" ? joinCode : "",
    });

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          account_type: accountType,
          school_name: resolvedSchoolName,
        },
        emailRedirectTo: callbackUrl,
      },
    });

    setActiveMethod("");

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setMessage(`Check your email to confirm your ${roleLabel.toLowerCase()} account, then continue.`);
  }

  async function onGoogleSignUp() {
    if (!accountType) {
      setError("Choose whether you're creating a teacher or student account first.");
      return;
    }
    if (!resolvedSchoolName) {
      setError("Choose an existing school or type a new one.");
      return;
    }

    setActiveMethod("google");
    setError("");
    setMessage("");

    const origin = window.location.origin;
    const supabase = createClient();
    const next = accountType === "student" ? "/play" : "/classes";
    const callbackUrl = buildCallbackUrl(origin, {
      next,
      accountType,
      schoolName: resolvedSchoolName,
      joinCode: accountType === "student" ? joinCode : "",
    });

    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (googleError) {
      setActiveMethod("");
      setError(googleError.message);
    }
  }

  const showRoleChooser = !accountType;

  return (
    <div className="stack authEntryStack">
      <section className="card authCardShell authChoiceShell authLandingCard">
        {showRoleChooser ? (
          <>
            <p className="authEyebrow">Create Account</p>
            <h1>Are you a teacher or a student?</h1>
            <p className="authIntroCopy">
              Pick the path that fits you best. We&apos;ll keep the next step simple.
            </p>

            <div className="accountChoiceGrid" role="radiogroup" aria-label="Account type">
              <button
                className="accountChoiceCard accountChoiceCardLarge"
                type="button"
                onClick={() => {
                  setAccountType("student");
                  setError("");
                  setMessage("");
                }}
              >
                <span className="accountChoiceEyebrow">Student</span>
                <strong>I want to play games</strong>
                <span>Join a class, save progress, and jump into the Student Arcade.</span>
              </button>

              <button
                className="accountChoiceCard accountChoiceCardLarge"
                type="button"
                onClick={() => {
                  setAccountType("teacher");
                  setError("");
                  setMessage("");
                }}
              >
                <span className="accountChoiceEyebrow">Teacher</span>
                <strong>I want planning tools</strong>
                <span>Create classes, build pacing plans, and track student game progress.</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="authBackRow">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setAccountType("");
                  setError("");
                  setMessage("");
                  setActiveMethod("");
                }}
              >
                Back
              </button>
              <span className="authBackLabel">{roleLabel} account</span>
            </div>

            <h1>{accountType === "student" ? "Create your student account" : "Create your teacher account"}</h1>
            <p className="authIntroCopy">
              {accountType === "student"
                ? "Students should use Google first whenever possible. Email and password are still available as a backup."
                : "Teachers can sign up with Google or with email and password."}
            </p>

            <section className="authFollowupCard authFollowupCardClean">
              <div className="list authForm compactAuthForm compactAuthFormClean" style={{ marginBottom: "1rem" }}>
                <label>
                  Existing School
                  <select
                    style={inputStyle}
                    value={selectedSchoolName}
                    onChange={(event) => setSelectedSchoolName(event.target.value)}
                  >
                    <option value="">Choose a school</option>
                    {schoolOptions.map((schoolName) => (
                      <option key={schoolName} value={schoolName}>
                        {schoolName}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Or Add A New School
                  <input
                    style={inputStyle}
                    type="text"
                    value={newSchoolName}
                    onChange={(event) => setNewSchoolName(event.target.value)}
                    placeholder="Type a new school name"
                  />
                </label>

                {accountType === "student" ? (
                  <label>
                    Join Class With A Code
                    <input
                      style={{ ...inputStyle, textTransform: "uppercase", letterSpacing: "0.08em" }}
                      type="text"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                      placeholder="Optional teacher code"
                      autoComplete="off"
                      spellCheck="false"
                    />
                  </label>
                ) : null}
              </div>

              <div className="ctaRow authPrimaryRow">
                <button className="btn primary googleBtn" disabled={isBusy} onClick={onGoogleSignUp} type="button">
                  {activeMethod === "google" ? "Opening Google..." : `Continue with Google as ${roleLabel}`}
                </button>
              </div>

              <div className="authDivider">
                <span>or create with email</span>
              </div>

              <form onSubmit={onSignUp} className="list authForm compactAuthForm compactAuthFormClean">
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

                <div className="ctaRow">
                  <button className="btn" disabled={isBusy} type="submit">
                    {activeMethod === "email" ? "Creating..." : `Create ${roleLabel} Account with Email`}
                  </button>
                </div>
              </form>
            </section>
          </>
        )}

        {error ? <p className="authStatus authError">{error}</p> : null}
        {message ? <p className="authStatus authSuccess">{message}</p> : null}

        <p style={{ marginTop: "0.5rem" }}>
          Already have an account? <Link href="/auth/sign-in">Sign in</Link>
        </p>
      </section>
    </div>
  );
}
