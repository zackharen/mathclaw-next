-- Lessons a teacher skipped for one class. Pacing rebuilds leave these out of
-- the sequence, so later lessons move up. Additive and safe to re-run.
alter table public.courses
  add column if not exists skipped_lesson_ids uuid[] not null default '{}';
