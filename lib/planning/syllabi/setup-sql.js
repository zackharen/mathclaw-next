// Idempotent SQL for loading a syllabus into a fixed-date course. Reusable for
// any syllabus module that returns { lessons, assignments } (ECC Trigonometry
// next). Inserts only; never updates or deletes, so reruns keep manual edits,
// moved release dates, and completion state.

function literal(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildSetupSql({ library, setup, courseId = null }) {
  const lib = `(select l.id from public.curriculum_libraries l join public.curriculum_providers p on p.id = l.provider_id
     where p.code = ${literal(library.providerCode)} and l.class_code = ${literal(library.classCode)})`;

  const lessonValues = setup.lessons
    .map((lesson) => `(${lesson.sequence_index}, ${literal(lesson.source_lesson_code)}, ${literal(lesson.title)}, ${literal(lesson.release)}::date)`)
    .join(",\n  ");

  const parts = [
    "begin;",
    `insert into public.curriculum_providers (code, name)
values (${literal(library.providerCode)}, ${literal(library.providerName)})
on conflict do nothing;`,
    `insert into public.curriculum_libraries (provider_id, class_code, class_name)
select p.id, ${literal(library.classCode)}, ${literal(library.className)}
from public.curriculum_providers p where p.code = ${literal(library.providerCode)}
on conflict (provider_id, class_code) do nothing;`,
    `insert into public.curriculum_lessons (library_id, sequence_index, source_lesson_code, title)
select ${lib}, v.seq, v.code, v.title
from (values
  ${lessonValues}
) as v(seq, code, title, release)
on conflict (library_id, sequence_index) do nothing;`,
  ];

  if (courseId) {
    const course = literal(courseId);
    const assignmentValues = setup.assignments
      .map(
        (item) =>
          `(${[
            item.source_key,
            item.label,
            item.assignment_date,
            item.due_date,
            item.release_time,
            item.due_time,
            item.category,
            item.provider,
            item.notes,
            item.is_draft,
            item.sort_order,
            item.lessonCode,
          ]
            .map(literal)
            .join(", ")})`
      )
      .join(",\n  ");

    parts.push(
      `do $$
begin
  if not exists (
    select 1 from public.courses
    where id = ${course} and pacing_mode = 'fixed_dates' and selected_library_id = ${lib} and archived_at is null
  ) then
    raise exception 'Course % must be an active syllabus-dates class using library ${library.classCode}', ${course};
  end if;
end $$;`,
      // A lesson already somewhere in the plan (possibly moved by hand) is left alone.
      `insert into public.course_lesson_plan (course_id, class_date, lesson_slot, lesson_id, status, is_added_buffer_day)
select ${course}, v.release, 1 + coalesce((select max(p.lesson_slot) from public.course_lesson_plan p
         where p.course_id = ${course} and p.class_date = v.release), 0),
       cl.id, 'planned', false
from (values
  ${lessonValues}
) as v(seq, code, title, release)
join public.curriculum_lessons cl on cl.library_id = ${lib} and cl.sequence_index = v.seq
where not exists (select 1 from public.course_lesson_plan p where p.course_id = ${course} and p.lesson_id = cl.id);`,
      `insert into public.teacher_announcement_assignments
  (owner_id, course_id, source_key, label, assignment_date, due_date, release_time, due_time,
   category, provider, notes, is_draft, sort_order, lesson_id)
select c.owner_id, c.id, v.source_key, v.label, v.assignment_date::date, v.due_date::date,
       v.release_time::time, v.due_time::time, v.category, v.provider, v.notes, v.is_draft, v.sort_order,
       (select cl.id from public.curriculum_lessons cl where cl.library_id = c.selected_library_id and cl.source_lesson_code = v.lesson_code limit 1)
from public.courses c
cross join (values
  ${assignmentValues}
) as v(source_key, label, assignment_date, due_date, release_time, due_time, category, provider, notes, is_draft, sort_order, lesson_code)
where c.id = ${course}
on conflict do nothing;`
    );
  }

  parts.push("commit;");
  return `${parts.join("\n\n")}\n`;
}
