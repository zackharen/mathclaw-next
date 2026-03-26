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
      <section className="card authCardShell">
        <h1>Sign In</h1>
        <p>Students should use Google first. Email/password is still available as a backup.</p>
        <SignInForm redirectTo={redirectTo} />
      </section>
    </div>
  );
}
