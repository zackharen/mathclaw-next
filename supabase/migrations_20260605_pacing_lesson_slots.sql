alter table public.courses
  add column if not exists pacing_weekday_modifiers jsonb not null default '{}'::jsonb;

alter table public.courses
  drop constraint if exists courses_pacing_mode_check;

update public.courses
set pacing_mode = 'two_lessons_per_day'
where pacing_mode = 'two_lessons_unless_modified';

alter table public.courses
  add constraint courses_pacing_mode_check
  check (
    pacing_mode in (
      'one_lesson_per_day',
      'one_lesson_no_half_days',
      'two_lessons_per_day',
      'manual_complete'
    )
  );

alter table public.course_lesson_plan
  add column if not exists lesson_slot integer not null default 1;

alter table public.course_lesson_plan
  drop constraint if exists course_lesson_plan_course_id_class_date_key;

alter table public.course_lesson_plan
  drop constraint if exists course_lesson_plan_course_date_slot_key;

alter table public.course_lesson_plan
  add constraint course_lesson_plan_lesson_slot_check check (lesson_slot >= 1);

alter table public.course_lesson_plan
  add constraint course_lesson_plan_course_date_slot_key unique (course_id, class_date, lesson_slot);

create index if not exists course_lesson_plan_course_date_slot_idx
on public.course_lesson_plan (course_id, class_date, lesson_slot);
