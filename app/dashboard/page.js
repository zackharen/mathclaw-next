import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { getSiteCopy } from "@/lib/site-config";

function prettyDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
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
    normalizedTitle
      .toLowerCase()
      .startsWith(`${normalizedCode.toLowerCase()}:`)
  ) {
    return normalizedTitle;
  }

  return `${normalizedCode}: ${normalizedTitle}`;
}

function paceDeltaLabel(delta) {
  if (delta === 0) return "On pace";
  if (delta > 0) return `${delta} day${delta === 1 ? "" : "s"} ahead`;
  const behind = Math.abs(delta);
  return `${behind} day${behind === 1 ? "" : "s"} behind`;
}

export default async function DashboardPage() {
  const siteCopy = await getSiteCopy();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountType = await getAccountTypeForUser(supabase, user);

  if (!isTeacherAccountType(accountType)) {
    redirect("/play");
  }

  if (!user) {
    redirect("/auth/sign-in?redirect=/dashboard");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding/profile");
  }

  let { data: courses, error } = await supabase
    .from("courses")
    .select(
      "id, title, class_name, schedule_model, ab_meeting_day, school_year_end, selected_library_id"
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (
    error &&
    typeof error.message === "string" &&
    error.message.includes("ab_meeting_day")
  ) {
    const retry = await supabase
      .from("courses")
      .select("id, title, class_name, schedule_model, school_year_end, selected_library_id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    courses = (retry.data || []).map((course) => ({ ...course, ab_meeting_day: null }));
    error = retry.error;
  }

  if (error) {
    return (
      <div className="stack">
        <section className="card">
          <h1>Pacing Dashboard</h1>
          <p>Could not load dashboard data: {error.message}</p>
        </section>
      </div>
    );
  }

  if (!courses || courses.length === 0) {
    return (
      <div className="stack">
        <section className="card">
          <h1>Pacing Dashboard</h1>
          <p>No classes yet. Create one to see pacing status.</p>
          <div className="ctaRow">
            <Link className="btn primary" href="/classes/new">
              Add Class
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const courseIds = courses.map((c) => c.id);
  const classNames = [...new Set(courses.map((c) => c.class_name).filter(Boolean))];
  const { data: planRows } = await supabase
    .from("course_lesson_plan")
    .select(
      "course_id, class_date, status, curriculum_lessons(source_lesson_code, title)"
    )
    .in("course_id", courseIds)
    .order("class_date", { ascending: true });

  const lessonCountByCourse = new Map();
  await Promise.all(
    courses.map(async (course) => {
      if (!course.selected_library_id) {
        lessonCountByCourse.set(course.id, 0);
        return;
      }

      const { count } = await supabase
        .from("curriculum_lessons")
        .select("id", { count: "exact", head: true })
        .eq("library_id", course.selected_library_id);

      lessonCountByCourse.set(course.id, count || 0);
    })
  );

  const rowsByCourse = new Map();
  for (const row of planRows || []) {
    const arr = rowsByCourse.get(row.course_id) || [];
    arr.push(row);
    rowsByCourse.set(row.course_id, arr);
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: connectionRows } = await supabase
    .from("teacher_connections")
    .select("requester_id, addressee_id, status")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .eq("status", "accepted");

  const connectedUserIds = [
    ...new Set(
      (connectionRows || []).map((row) =>
        row.requester_id === user.id ? row.addressee_id : row.requester_id
      )
    ),
  ];

  const { data: colleagueCourses } =
    connectedUserIds.length && classNames.length
      ? await supabase
          .from("courses")
          .select("id, owner_id, class_name")
          .in("owner_id", connectedUserIds)
          .in("class_name", classNames)
      : { data: [] };

  const colleagueCourseIds = (colleagueCourses || []).map((c) => c.id);
  const { data: colleagueCompletedRows } = colleagueCourseIds.length
    ? await supabase
        .from("course_lesson_plan")
        .select("course_id")
        .in("course_id", colleagueCourseIds)
        .eq("status", "completed")
    : { data: [] };

  const completedByColleagueCourse = new Map();
  for (const row of colleagueCompletedRows || []) {
    const next = (completedByColleagueCourse.get(row.course_id) || 0) + 1;
    completedByColleagueCourse.set(row.course_id, next);
  }

  const colleagueStatsByClass = new Map();
  for (const course of colleagueCourses || []) {
    const completed = completedByColleagueCourse.get(course.id) || 0;
    const stats = colleagueStatsByClass.get(course.class_name) || {
      totalCompleted: 0,
      samples: 0,
    };
    stats.totalCompleted += completed;
    stats.samples += 1;
    colleagueStatsByClass.set(course.class_name, stats);
  }

  const cards = courses.map((course) => {
    const rows = rowsByCourse.get(course.id) || [];
    const totalLessons = lessonCountByCourse.get(course.id) || rows.length || 0;
    const completedRows = rows.filter((r) => r.status === "completed");
    const completed = completedRows.length;
    const remaining = Math.max(totalLessons - completed, 0);

    const expectedByNow = rows.filter((r) => r.class_date <= todayIso).length;
    const delta = completed - expectedByNow;

    const currentRow = completedRows[completedRows.length - 1] || null;
    const projectedRow = rows[rows.length - 1] || null;
    const colleagueStats = colleagueStatsByClass.get(course.class_name) || null;
    const colleagueAvg = colleagueStats
      ? Math.round((colleagueStats.totalCompleted / colleagueStats.samples) * 10) / 10
      : null;
    const colleagueDelta =
      colleagueAvg == null ? null : Math.round((completed - colleagueAvg) * 10) / 10;

    const progressPct = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0;

    return {
      course,
      completed,
      remaining,
      totalLessons,
      delta,
      progressPct,
      currentLesson: currentRow?.curriculum_lessons
        ? formatLessonLabel(
            currentRow.curriculum_lessons.source_lesson_code,
            currentRow.curriculum_lessons.title
          )
        : "Not started",
      projectedEnd: projectedRow?.class_date || course.school_year_end,
      colleagueAvg,
      colleagueCount: colleagueStats?.samples || 0,
      colleagueDelta,
    };
  });

  return (
    <div className="stack">
      <section className="card">
        <h1>{siteCopy.dashboardTitle}</h1>
        <p>{siteCopy.dashboardDescription}</p>
      </section>

      <section className="card">
        <div className="list">
          {cards.map((card) => (
            <article key={card.course.id} className="card" style={{ background: "#fff" }}>
              <h3>{card.course.title}</h3>
              <p>
                {card.course.class_name} |{" "}
                {card.course.schedule_model === "ab"
                  ? `AB (${card.course.ab_meeting_day || "A/B"})`
                  : "Every Day"}
              </p>
              <div className="kv" style={{ marginTop: "0.55rem" }}>
                <div>
                  <strong>Current Unit Position</strong>
                  <span>{card.currentLesson}</span>
                </div>
                <div>
                  <strong>Completed</strong>
                  <span>
                    {card.completed}/{card.totalLessons} ({card.progressPct}%)
                  </span>
                </div>
                <div>
                  <strong>Remaining Lessons</strong>
                  <span>{card.remaining}</span>
                </div>
                <div>
                  <strong>Projected Final Lesson Date</strong>
                  <span>{prettyDate(card.projectedEnd)}</span>
                </div>
                <div>
                  <strong>Pacing Delta</strong>
                  <span>{paceDeltaLabel(card.delta)}</span>
                </div>
                <div>
                  <strong>Colleague Comparison</strong>
                  <span>
                    {card.colleagueAvg == null
                      ? "No connected colleague data"
                      : `Avg completed: ${card.colleagueAvg} (${card.colleagueCount} class${
                          card.colleagueCount === 1 ? "" : "es"
                        }) | You ${
                          card.colleagueDelta === 0
                            ? "match"
                            : card.colleagueDelta > 0
                              ? `lead by ${card.colleagueDelta}`
                              : `trail by ${Math.abs(card.colleagueDelta)}`
                        }`}
                  </span>
                </div>
              </div>
              <div className="ctaRow">
                <Link className="btn" href={`/classes/${card.course.id}/plan`}>
                  Open Plan
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
