import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateCalendarAction, updateCalendarDayAction } from "./actions";

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

export default async function ClassCalendarPage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirect=/classes/${id}/calendar`);
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, title, class_name, schedule_model, school_year_start, school_year_end")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (!course) {
    redirect("/classes");
  }

  const { data: reasons } = await supabase
    .from("day_off_reasons")
    .select("id, label")
    .or(`owner_id.is.null,owner_id.eq.${user.id}`)
    .order("label", { ascending: true });

  const { data: days } = await supabase
    .from("course_calendar_days")
    .select("class_date, day_type, ab_day, reason_id, note")
    .eq("course_id", course.id)
    .order("class_date", { ascending: true });

  const totalDays = days?.length || 0;
  const instructionalDays = days?.filter((d) => d.day_type === "instructional").length || 0;
  const offDays = days?.filter((d) => d.day_type === "off").length || 0;

  return (
    <div className="stack">
      <section className="card">
        <h1>{course.title}: Calendar</h1>
        <p>
          {course.class_name} | {course.schedule_model === "ab" ? "AB" : "Every Day"} | {course.school_year_start} to {course.school_year_end}
        </p>
        <div className="ctaRow">
          <Link className="btn" href="/classes">
            Back to Classes
          </Link>
          {totalDays === 0 ? (
            <form action={generateCalendarAction}>
              <input type="hidden" name="course_id" value={course.id} />
              <button className="btn primary" type="submit">
                Generate Calendar
              </button>
            </form>
          ) : null}
        </div>
      </section>

      {totalDays > 0 ? (
        <section className="card">
          <div className="kv">
            <div><strong>Total Days</strong><span>{totalDays}</span></div>
            <div><strong>Instructional</strong><span>{instructionalDays}</span></div>
            <div><strong>Off</strong><span>{offDays}</span></div>
          </div>
        </section>
      ) : null}

      {totalDays > 0 ? (
        <section className="card">
          <h2>Daily Schedule</h2>
          <p>Edit day type/reason. Weekends are pre-filled as off.</p>
          <div className="calendarGridHeader">
            <span>Date</span>
            <span>AB</span>
            <span>Day Type</span>
            <span>Reason</span>
            <span>Note</span>
            <span>Action</span>
          </div>
          <div className="calendarGridBody">
            {days.map((day) => (
              <form className="calendarRow" key={day.class_date} action={updateCalendarDayAction}>
                <input type="hidden" name="course_id" value={course.id} />
                <input type="hidden" name="class_date" value={day.class_date} />
                <span>{prettyDate(day.class_date)}</span>
                <span>{day.ab_day || "-"}</span>
                <select className="input" name="day_type" defaultValue={day.day_type}>
                  <option value="instructional">Instructional</option>
                  <option value="off">Off</option>
                  <option value="half">Half Day</option>
                  <option value="modified">Modified</option>
                </select>
                <select className="input" name="reason_id" defaultValue={day.reason_id || ""}>
                  <option value="">None</option>
                  {(reasons || []).map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.label}
                    </option>
                  ))}
                </select>
                <input className="input" name="note" defaultValue={day.note || ""} placeholder="Optional" />
                <button className="btn" type="submit">Save</button>
              </form>
            ))}
          </div>
        </section>
      ) : (
        <section className="card">
          <p>No calendar rows yet. Click Generate Calendar.</p>
        </section>
      )}
    </div>
  );
}
