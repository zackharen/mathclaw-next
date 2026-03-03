import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./profile-form";
import {
  saveAnnouncementTemplateAction,
  saveSchoolCalendarAction,
} from "./actions";

function defaultSchoolYearDates() {
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;

  return {
    start: `${year}-09-01`,
    end: `${year + 1}-06-30`,
  };
}

function parseDateAtUTC(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toISODate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

function buildWeekdays(startIso, endIso) {
  const start = parseDateAtUTC(startIso);
  const end = parseDateAtUTC(endIso);
  const dates = [];

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const dow = cursor.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    dates.push(toISODate(cursor));
  }

  return dates;
}


function buildABMap(dates, abPatternStartIso) {
  const map = new Map();
  if (!abPatternStartIso) {
    dates.forEach((d) => map.set(d, "-"));
    return map;
  }

  const start = parseDateAtUTC(abPatternStartIso);
  let current = "A";

  for (const date of dates) {
    const dateObj = parseDateAtUTC(date);
    if (dateObj < start) {
      map.set(date, "-");
      continue;
    }
    map.set(date, current);
    current = current === "A" ? "B" : "A";
  }

  return map;
}
export default async function OnboardingProfilePage({ searchParams }) {
  const qs = (await searchParams) || {};
  const schoolCalendarUpdated = qs.school_calendar_updated === "1";
  const templateUpdated = qs.template_updated === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/onboarding/profile");
  }

  const defaults = defaultSchoolYearDates();

  let migrationNeeded = false;

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, school_name, timezone, school_year_start, school_year_end")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError &&
    typeof profileError.message === "string" &&
    profileError.message.includes("school_year_start")
  ) {
    const retry = await supabase
      .from("profiles")
      .select("display_name, school_name, timezone")
      .eq("id", user.id)
      .maybeSingle();

    profile = retry.data
      ? {
          ...retry.data,
          school_year_start: defaults.start,
          school_year_end: defaults.end,
        }
      : null;

    profileError = retry.error;
    migrationNeeded = true;
  }

  const schoolYearStart = profile?.school_year_start || defaults.start;
  const schoolYearEnd = profile?.school_year_end || defaults.end;

  const { data: abSeedCourse } = await supabase
    .from("courses")
    .select("ab_pattern_start_date")
    .eq("owner_id", user.id)
    .eq("schedule_model", "ab")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();


  const weekdays = buildWeekdays(schoolYearStart, schoolYearEnd);
  const abPatternStartIso = abSeedCourse?.ab_pattern_start_date || schoolYearStart;
  const abByDate = buildABMap(weekdays, abPatternStartIso);

  const { data: reasons } = await supabase
    .from("day_off_reasons")
    .select("id, label")
    .or(`owner_id.is.null,owner_id.eq.${user.id}`)
    .order("label", { ascending: true });

  let schoolDays = [];
  if (!migrationNeeded) {
    const { data: schoolDaysData, error: schoolDaysError } = await supabase
      .from("school_calendar_days")
      .select("class_date, day_type, reason_id, note")
      .eq("owner_id", user.id)
      .gte("class_date", schoolYearStart)
      .lte("class_date", schoolYearEnd)
      .order("class_date", { ascending: true });

    if (
      schoolDaysError &&
      typeof schoolDaysError.message === "string" &&
      schoolDaysError.message.includes("school_calendar_days")
    ) {
      migrationNeeded = true;
    } else {
      schoolDays = schoolDaysData || [];
    }
  }

  const schoolDayByDate = new Map(
    (schoolDays || []).map((row) => [row.class_date, row])
  );

  const { data: templateRow } = await supabase
    .from("announcement_templates")
    .select("body_template")
    .eq("owner_id", user.id)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  const defaultTemplate =
    templateRow?.body_template ||
    `Date: {date}
Class: {class_name}
Day Type: {day_type}
Lesson: {lesson_title}
Objective: {objective}
Standards: {standards}`;

  return (
    <div className="stack">
      <section className="card">
        <h1>Profile</h1>
        <p>Update your teacher profile details.</p>
        <ProfileForm
          userId={user.id}
          initialDisplayName={profile?.display_name || ""}
          initialSchoolName={profile?.school_name || ""}
          initialTimezone={profile?.timezone || "America/New_York"}
        />
      </section>

      <section className="card">
        <h2>School Calendar</h2>
        <p>
          Set school-year dates and non-full school days once, then apply to all
          classes.
        </p>

        <details style={{ marginTop: "0.75rem" }}>
          <summary className="btn" style={{ display: "inline-block" }}>
            School Calendar
          </summary>

          {migrationNeeded ? (
            <p style={{ marginTop: "0.75rem" }}>
              School Calendar needs the latest SQL migration before it can be
              edited.
            </p>
          ) : (
            <form action={saveSchoolCalendarAction} className="list" style={{ marginTop: "0.75rem" }}>
              <div className="schoolYearRangeRow">
                <label>
                  School Year Start
                  <input
                    className="input"
                    type="date"
                    name="school_year_start"
                    defaultValue={schoolYearStart}
                    required
                  />
                </label>
                <label>
                  School Year End
                  <input
                    className="input"
                    type="date"
                    name="school_year_end"
                    defaultValue={schoolYearEnd}
                    required
                  />
                </label>
              </div>

              <div className="schoolCalendarHeader">
                <span>Date</span>
                <span>AB</span>
                <span>Day Type</span>
                <span>Reason</span>
                <span>Note</span>
              </div>

              <div className="schoolCalendarBody">
                {weekdays.map((date) => {
                  const row = schoolDayByDate.get(date);
                  return (
                    <div className="schoolCalendarRow" key={date}>
                      <span>{prettyDate(date)}</span>
                      <span>{abByDate.get(date) || "-"}</span>
                      <select
                        className="input"
                        name={`day_type__${date}`}
                        defaultValue={row?.day_type || "instructional"}
                      >
                        <option value="instructional">Full</option>
                        <option value="off">Off</option>
                        <option value="half">Half Day</option>
                        <option value="modified">Modified</option>
                      </select>
                      <select
                        className="input"
                        name={`reason_id__${date}`}
                        defaultValue={row?.reason_id || ""}
                      >
                        <option value="">None</option>
                        {(reasons || []).map((reason) => (
                          <option key={reason.id} value={reason.id}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        name={`note__${date}`}
                        defaultValue={row?.note || ""}
                        placeholder="Optional"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="ctaRow">
                <button className="btn primary" type="submit">
                  Apply Calendar Changes
                </button>
                {schoolCalendarUpdated ? (
                  <span className="statusNote">School Calendar Updated!</span>
                ) : null}
              </div>
            </form>
          )}
        </details>
      </section>

      <section className="card">
        <h2>Announcement Template</h2>
        <p>
          Control how daily announcements are generated. Supported placeholders:
          {" "}
          <code>{"{date}"}</code>, <code>{"{class_name}"}</code>,{" "}
          <code>{"{day_type}"}</code>, <code>{"{reason}"}</code>,{" "}
          <code>{"{lesson_title}"}</code>, <code>{"{objective}"}</code>,{" "}
          <code>{"{standards}"}</code>.
        </p>

        <form
          action={saveAnnouncementTemplateAction}
          className="list"
          style={{ marginTop: "0.75rem" }}
        >
          <textarea
            className="input"
            name="body_template"
            rows={8}
            defaultValue={defaultTemplate}
          />
          <div className="ctaRow">
            <button className="btn primary" type="submit">
              Save Template
            </button>
            {templateUpdated ? (
              <span className="statusNote">Template Updated!</span>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
