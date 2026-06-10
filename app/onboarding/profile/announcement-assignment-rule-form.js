"use client";

import { useMemo, useState } from "react";

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

function asString(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

export default function AnnouncementAssignmentRuleForm({
  action,
  courses,
  rule = null,
  submitLabel = "Save Assignment Type",
}) {
  const settings = rule?.settings || {};
  const [cadence, setCadence] = useState(rule?.cadence || "weekly");
  const selectedWeekdays = useMemo(
    () => new Set((settings.weekdays || []).map((day) => String(day))),
    [settings.weekdays]
  );

  return (
    <form action={action} className="list">
      {rule?.id ? <input type="hidden" name="rule_id" value={rule.id} /> : null}

      <div className="schoolYearRangeRow">
        <label>
          Assignment Type
          <input className="input" name="label" defaultValue={rule?.label || ""} placeholder="Assessment" required />
        </label>
        <label>
          Applies To
          <select className="input" name="course_scope" defaultValue={rule?.course_id || "all"}>
            <option value="all">All classes</option>
            {(courses || []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700 }}>Happens Every...</legend>
          <div className="ctaRow" style={{ marginTop: "0.35rem" }}>
            {[
              ["weekly", "Weeks"],
              ["monthly", "Month"],
              ["marking_period", "Marking Period"],
            ].map(([value, label]) => (
              <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="radio"
                  name="cadence"
                  value={value}
                  checked={cadence === value}
                  onChange={() => setCadence(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {cadence === "weekly" ? (
        <div className="list">
          <label style={{ maxWidth: "12rem" }}>
            Every
            <input
              className="input"
              type="number"
              min="1"
              max="12"
              name="week_interval"
              defaultValue={asString(settings.week_interval, rule?.cadence === "biweekly" ? "2" : "1")}
            />
          </label>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700 }}>Weekday</legend>
            <div className="ctaRow" style={{ marginTop: "0.35rem" }}>
              {WEEKDAY_OPTIONS.map((day) => (
                <label key={day.value} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <input
                    type="checkbox"
                    name="weekday"
                    value={day.value}
                    defaultChecked={selectedWeekdays.size ? selectedWeekdays.has(String(day.value)) : day.value === 5}
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label style={{ maxWidth: "20rem" }}>
            If class doesn't meet on this day
            <select className="input" name="no_meeting_shift" defaultValue={settings.no_meeting_shift || "before"}>
              <option value="before">Use nearest class day before</option>
              <option value="after">Use nearest class day after</option>
              <option value="same_day">Due that day anyway</option>
              <option value="skip">Skip (don't generate)</option>
            </select>
          </label>
        </div>
      ) : null}

      {cadence === "monthly" ? (
        <div className="schoolYearRangeRow">
          <label>
            Day of Month
            <input className="input" type="number" min="1" max="31" name="month_day" defaultValue={settings.month_days?.[0] || ""} placeholder="15" />
          </label>
          <label>
            If Not School Day
            <select className="input" name="monthly_shift" defaultValue={settings.monthly_shift || "after"}>
              <option value="after">First school day after</option>
              <option value="before">First school day before</option>
            </select>
          </label>
        </div>
      ) : null}

      {cadence === "marking_period" ? (
        <div className="list">
          <label style={{ maxWidth: "16rem" }}>
            Times Per Marking Period
            <input className="input" type="number" min="1" max="20" name="count_per_period" defaultValue={rule?.count_per_period || 1} />
          </label>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700 }}>Weekday</legend>
            <div className="ctaRow" style={{ marginTop: "0.35rem" }}>
              {WEEKDAY_OPTIONS.map((day) => (
                <label key={day.value} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <input
                    type="checkbox"
                    name="weekday"
                    value={day.value}
                    defaultChecked={selectedWeekdays.has(String(day.value))}
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label style={{ maxWidth: "20rem" }}>
            If class doesn't meet on this day
            <select className="input" name="no_meeting_shift" defaultValue={settings.no_meeting_shift || "before"}>
              <option value="before">Use nearest class day before</option>
              <option value="after">Use nearest class day after</option>
              <option value="same_day">Due that day anyway</option>
              <option value="skip">Skip (don't generate)</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="ctaRow">
        <button className="btn primary" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
