-- Lessons a teacher switched for one class, as [lessonIdA, lessonIdB] pairs.
-- Pacing rebuilds apply them to the library order. Additive and safe to re-run.
alter table public.courses
  add column if not exists lesson_swaps jsonb not null default '[]'::jsonb;
