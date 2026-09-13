alter table public.course_calendar_days
  add column if not exists lesson_count_override integer;

alter table public.course_calendar_days
  drop constraint if exists course_calendar_days_lesson_count_override_check;

alter table public.course_calendar_days
  add constraint course_calendar_days_lesson_count_override_check
  check (lesson_count_override is null or lesson_count_override between 0 and 2);
