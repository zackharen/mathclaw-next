alter table public.courses
  drop constraint if exists courses_pacing_mode_check;

alter table public.courses
  add constraint courses_pacing_mode_check
  check (
    pacing_mode in (
      'one_lesson_per_day',
      'two_lessons_per_day',
      'two_lessons_unless_modified',
      'manual_complete'
    )
  );

alter table public.announcement_templates
  add column if not exists include_day_number boolean not null default false,
  add column if not exists include_day_of_week boolean not null default false,
  add column if not exists include_regular_assignments boolean not null default false,
  add column if not exists regular_assignments text;
