import { redirect } from "next/navigation";
import Link from "next/link";
import { context } from "@/lib/assessments/server";
import DesmosWorkspace from "./workspace";
export default async function Page({ searchParams }) {
  const p = await searchParams;
  try {
    await context(p.course);
  } catch (e) {
    if (e.status === 401) redirect("/auth/sign-in?redirect=/desmos");
    return (
      <section className="card">
        <h1>Desmos</h1>
        <p>{e.message}</p>
        <Link href="/play">Arcade</Link>
      </section>
    );
  }
  return <DesmosWorkspace courseId={p.course || ""} />;
}
