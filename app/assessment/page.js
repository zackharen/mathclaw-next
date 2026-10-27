import { redirect } from "next/navigation";
import Link from "next/link";
import { context } from "@/lib/assessments/server";
import AssessmentWorkspace from "./workspace";
export default async function Page({ searchParams }) {
  const p = await searchParams;
  try {
    await context(p.course);
  } catch (e) {
    if (e.status === 401) redirect("/auth/sign-in?redirect=/assessment");
    return (
      <section className="card">
        <h1>Assessment</h1>
        <p>{e.message}</p>
        <Link href="/dashboard">Dashboard</Link>
      </section>
    );
  }
  return <AssessmentWorkspace courseId={p.course || ""} />;
}
