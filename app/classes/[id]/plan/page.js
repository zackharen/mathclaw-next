import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generatePacingAction } from "./actions";

function prettyDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatLessonLabel(sourceLessonCode, title) {
  const safeTitle = title || "Untitled Lesson";
  if (!sourceLessonCode) return safeTitle;

  const normalizedCode = String(sourceLessonCode).trim();
  const normalizedTitle = String(safeTitle).trim();

  if (
    normalizedTitle.toLowerCase().startsWith(`${normalizedCode.toLowerCase()}:`)
  ) {
    return normalizedTitle;
  }

  return `${normalizedCode}: ${normalizedTitle}`;
}

export default async function ClassPlanPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${id}/plan`);
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, class_name, selected_library_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!course) {
    redirect("/classes");
  }

  const { count: totalLessonsCount } = await supabase
    .from("curriculum_lessons")
    .select("id", { count: "exact", head: true })
    .eq("library_id", course.selected_library_id);

  const { count: instructionalDaysCount } = await supabase
    .from("course_calendar_days")
    .select("class_date", { count: "exact", head: true })
    .eq("course_id", course.id)
    .eq("day_type", "instructional");

  const { data: planRows, error: planError } = await supabase
    .from("course_lesson_plan")
    .select("class_date, status, curriculum_lessons(sequence_index, source_lesson_code, title, objective)")
    .eq("course_id", course.id)
    .order("class_date", { ascending: true });

  const plannedCount = planRows?.length || 0;

  return (
    <div className="stack">
      <section className="card">
        <h1>{course.title}: Pacing Plan</h1>
        <p>{course.class_name}</p>
        <div className="ctaRow">
          <Link className="btn" href="/classes">
            Back to Classes
          </Link>
          <Link className="btn" href={`/classes/${course.id}/calendar`}>
            Open Calendar
          </Link>
          <form action={generatePacingAction}>
            <input type="hidden" name="course_id" value={course.id} />
            <button className="btn primary" type="submit">
              Generate Pacing
            </button>
          </form>
        </div>
      </section>

      <section className="card">
          <div className="kv">
          <div><strong>Instructional Days</strong><span>{instructionalDaysCount || 0}</span></div>
          <div><strong>Library Lessons</strong><span>{totalLessonsCount || 0}</span></div>
          <div><strong>Planned Lessons</strong><span>{plannedCount}</span></div>
        </div>
      </section>

      <section className="card">
        <h2>Lesson by Day</h2>
        {planError ? <p>Could not load pacing plan: {planError.message}</p> : null}

        {!planError && plannedCount === 0 ? (
          <p>No pacing rows yet. Click Generate Pacing.</p>
        ) : null}

        {!planError && plannedCount > 0 ? (
          <div className="list">
            {planRows.map((row) => {
              const lesson = row.curriculum_lessons;
              return (
                <article key={row.class_date} className="card" style={{ background: "#fff" }}>
                  <h3>{prettyDate(row.class_date)}</h3>
                  <p>{formatLessonLabel(lesson?.source_lesson_code, lesson?.title)}</p>
                  <p>{lesson?.objective || "No objective provided."}</p>
                  <p style={{ fontSize: "0.85rem", opacity: 0.75 }}>Status: {row.status}</p>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
