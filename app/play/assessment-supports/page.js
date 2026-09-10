import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import { loadStudentAssessmentSupportsData } from "@/lib/assessment-supports/server";
import { totalActiveDeduction } from "@/lib/assessment-supports/pricing";

function assessmentLabel(occurrence) {
  if (!occurrence) return "Upcoming assessment";
  const date = new Date(`${occurrence.assignment_date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${occurrence.label} ${occurrence.assessment_number} · ${date}`;
}

function recordedDate(value) {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function StudentAssessmentSupportsPage({ searchParams }) {
  const params = (await searchParams) || {};
  const courseId = typeof params.course === "string" ? params.course : "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=${encodeURIComponent(`/play/assessment-supports?course=${courseId}`)}`);
  }

  const courses = await listAccessibleCourses(supabase, user.id);
  const membership = courses.find((course) => course.id === courseId && course.relationship === "student");
  if (!membership) redirect("/play");

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, title, class_name, owner_id, school_year_start, school_year_end, schedule_model, ab_meeting_day")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError || !course) redirect("/play");

  const data = await loadStudentAssessmentSupportsData({
    supabase,
    userId: user.id,
    course,
    todayIso: new Date().toISOString().slice(0, 10),
  });
  const activeUsages = (data.usages || []).filter((usage) => !usage.voided_at);

  return (
    <div className="stack studentAssessmentSupportsPage">
      <section className="card">
        <p className="eyebrow">{course.title}</p>
        <h1>Assessment Supports</h1>
        <p>
          Optional supports deduct points from the score you earn. Required IEP/504 or other mandated
          accommodations always show as 0 points and never raise a future price.
        </p>
        <div className="ctaRow" style={{ marginTop: "1rem" }}>
          <Link className="btn" href={`/play?course=${course.id}`}>Back to Your Arcade</Link>
        </div>
      </section>

      {!data.available ? (
        <section className="card"><p>Assessment supports are not available yet.</p></section>
      ) : !data.published ? (
        <section className="card">
          <h2>Price List Hidden</h2>
          <p>Your teacher has not published the current assessment-support choices.</p>
        </section>
      ) : (
        <section className="card">
          <h2>{assessmentLabel(data.upcomingOccurrence)}</h2>
          {!data.upcomingOccurrence ? (
            <p>No upcoming assessment is scheduled right now.</p>
          ) : data.supports.length === 0 ? (
            <p>No optional supports are enabled for this assessment.</p>
          ) : (
            <div className="studentAssessmentSupportGrid">
              {data.supports.map((support) => (
                <article className="card studentAssessmentSupportChoice" key={support.id}>
                  <div>
                    <h3>{support.name}</h3>
                    {support.description ? <p>{support.description}</p> : null}
                  </div>
                  <strong>{support.current_cost}-point deduction</strong>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2>Your Recorded Supports</h2>
        <p>Only you and your class teachers can see these records.</p>
        <p className="assessmentSupportsStudentTotal">Active deductions shown below: {totalActiveDeduction(data.usages || [])} points</p>
        {(data.usages || []).length === 0 ? (
          <p style={{ marginTop: "1rem" }}>No assessment supports have been recorded for you.</p>
        ) : (
          <div className="list" style={{ marginTop: "1rem" }}>
            {(data.usages || []).map((usage) => (
              <article className={`card assessmentSupportUsage ${usage.voided_at ? "isVoided" : ""}`} key={usage.id}>
                <div>
                  <strong>{usage.support_name}</strong>
                  <p>{usage.assessment_label} {usage.assessment_number} · {usage.marking_period_name}</p>
                  <p>
                    {usage.usage_type === "required_accommodation"
                      ? "Required accommodation · 0 points"
                      : `${usage.charged_cost}-point deduction`}
                    {usage.voided_at ? " · Voided by your teacher" : ""}
                  </p>
                  <p className="statusNote">Recorded {recordedDate(usage.recorded_at)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
        {activeUsages.length === 0 && (data.usages || []).some((usage) => usage.voided_at) ? (
          <p className="statusNote">Your prior entries are voided and do not deduct points.</p>
        ) : null}
      </section>
    </div>
  );
}
