"use client";

import { useMemo, useState } from "react";
import { createClassAction } from "./actions";

export default function NewClassForm({
  timezone,
  libraries,
  defaultStart,
  defaultEnd,
  existingCourses,
  teacherOptions = [],
  defaultOwnerId = "",
}) {
  const libraryOptions = useMemo(
    () =>
      libraries.map((item) => ({
        id: item.id,
        classCode: item.class_code,
        className: item.class_name,
      })),
    [libraries]
  );

  const [title, setTitle] = useState("");
  const [selectedLibraryId, setSelectedLibraryId] = useState(
    libraryOptions[0]?.id || ""
  );
  const [scheduleModel, setScheduleModel] = useState("every_day");
  const [abMeetingDay, setAbMeetingDay] = useState("A");
  const [abStartDate, setAbStartDate] = useState(defaultStart);
  const [pacingMode, setPacingMode] = useState("one_lesson_per_day");
  const [importCourseId, setImportCourseId] = useState("");
  const [schoolYearStart, setSchoolYearStart] = useState(defaultStart);
  const [schoolYearEnd, setSchoolYearEnd] = useState(defaultEnd);
  const [ownerId, setOwnerId] = useState(defaultOwnerId || teacherOptions[0]?.id || "");

  return (
    <form action={createClassAction} className="list formList" style={{ marginTop: "1rem" }}>
      {teacherOptions.length > 0 ? (
        <label>
          Class Owner
          <select
            className="input"
            name="owner_id"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            {teacherOptions.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        Class Title
        <input
          className="input"
          type="text"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Algebra I - Period 2"
        />
      </label>

      <label>
        Curriculum Track (Math Medic)
        <select
          className="input"
          name="selected_library_id"
          required
          value={selectedLibraryId}
          onChange={(e) => setSelectedLibraryId(e.target.value)}
        >
          {libraryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.classCode} - {option.className}
            </option>
          ))}
        </select>
      </label>

      <label>
        Schedule Model
        <select
          className="input"
          name="schedule_model"
          value={scheduleModel}
          onChange={(e) => setScheduleModel(e.target.value)}
        >
          <option value="every_day">Every Day</option>
          <option value="ab">AB Schedule</option>
        </select>
      </label>

      {scheduleModel === "ab" ? (
        <>
          <label>
            Meets On
            <select
              className="input"
              name="ab_meeting_day"
              value={abMeetingDay}
              onChange={(e) => setAbMeetingDay(e.target.value)}
            >
              <option value="A">A Days</option>
              <option value="B">B Days</option>
            </select>
          </label>
          <label>
            AB Pattern Start Date
            <input
              className="input"
              type="date"
              name="ab_pattern_start_date"
              required
              value={abStartDate}
              onChange={(e) => setAbStartDate(e.target.value)}
            />
          </label>
        </>
      ) : null}

      <label>
        Pacing Mode
        <select
          className="input"
          name="pacing_mode"
          value={pacingMode}
          onChange={(e) => setPacingMode(e.target.value)}
        >
          <option value="one_lesson_per_day">One Lesson Per Full Day</option>
          <option value="two_lessons_per_day">2 Lessons Per Day</option>
          <option value="two_lessons_unless_modified">
            2 Lessons Per Day Unless There Is a Modified Schedule
          </option>
          <option value="manual_complete">Manual (Move On When Marked Complete)</option>
        </select>
      </label>

      <label>
        Import Calendar From Existing Class (Optional)
        <select
          className="input"
          name="import_course_id"
          value={importCourseId}
          onChange={(e) => setImportCourseId(e.target.value)}
        >
          <option value="">No import (use default calendar)</option>
          {(existingCourses || []).map((course) => (
            <option key={course.id} value={course.id}>
              {course.title} | {course.class_name} | {course.school_year_start} to {course.school_year_end}
            </option>
          ))}
        </select>
      </label>

      <label>
        School Year Start
        <input
          className="input"
          type="date"
          name="school_year_start"
          required
          value={schoolYearStart}
          onChange={(e) => setSchoolYearStart(e.target.value)}
        />
      </label>

      <label>
        School Year End
        <input
          className="input"
          type="date"
          name="school_year_end"
          required
          value={schoolYearEnd}
          onChange={(e) => setSchoolYearEnd(e.target.value)}
        />
      </label>

      <p>
        You can change pacing mode later from the class Plan page.
      </p>

      <input type="hidden" name="timezone" value={timezone} />

      <div className="ctaRow">
        <button className="btn primary" type="submit">Create Class</button>
      </div>
    </form>
  );
}
