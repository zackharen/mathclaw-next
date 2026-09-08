"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

function optionLabel(course) {
  if (!course.class_name || course.class_name === course.title) return course.title;
  return `${course.title} — ${course.class_name}`;
}

export default function ClassSwitcher({ courses, currentCourseId, destination = "plan" }) {
  const router = useRouter();
  const [selectedCourseId, setSelectedCourseId] = useState(currentCourseId);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedCourseId(currentCourseId);
  }, [currentCourseId]);

  if (!Array.isArray(courses) || courses.length < 2) return null;

  function changeClass(event) {
    const courseId = event.target.value;
    setSelectedCourseId(courseId);
    startTransition(() => {
      router.push(`/classes/${encodeURIComponent(courseId)}/${destination}`);
    });
  }

  return (
    <label className="classSwitcher">
      <span>Switch class</span>
      <select
        className="input"
        value={selectedCourseId}
        onChange={changeClass}
        disabled={isPending}
        aria-label="Switch class"
      >
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {optionLabel(course)}
          </option>
        ))}
      </select>
    </label>
  );
}

