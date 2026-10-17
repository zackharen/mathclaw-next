-- When and from which day each lesson was skipped, and when a skip was undone.
-- courses.skipped_lesson_ids remains what pacing uses. Additive, safe to re-run.
alter table public.courses
  add column if not exists skipped_lesson_log jsonb not null default '[]'::jsonb;
