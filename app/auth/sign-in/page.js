import SignInForm from "./sign-in-form";

export default async function SignInPage({ searchParams }) {
  const params = await searchParams;
  const redirectRaw = params?.redirect;
  const redirectTo =
    typeof redirectRaw === "string" && redirectRaw.startsWith("/")
      ? redirectRaw
      : "/classes";

  return (
    <div className="stack">
      <section className="card">
        <h1>Sign In</h1>
        <p>Use email/password or Google.</p>
        <SignInForm redirectTo={redirectTo} />
      </section>
    </div>
  );
}
