-- Courses that follow a published syllabus (e.g. ECC half-year courses) keep
-- each lesson on its explicit release date instead of being re-paced from the
-- calendar. Their dated assignments live in teacher_announcement_assignments,
-- which gains the fields a syllabus row needs.

alter table public.courses
  drop constraint if exists courses_pacing_mode_check;

alter table public.courses
  add constraint courses_pacing_mode_check
    check (
      pacing_mode in (
        'one_lesson_per_day',
        'one_lesson_no_half_days',
        'two_lessons_per_day',
        'manual_complete',
        'fixed_dates'
      )
    );

alter table public.teacher_announcement_assignments
  add column if not exists lesson_id uuid references public.curriculum_lessons (id) on delete set null,
  add column if not exists category text,
  add column if not exists provider text,
  add column if not exists url text,
  add column if not exists notes text,
  add column if not exists release_time time,
  add column if not exists due_time time,
  add column if not exists is_draft boolean not null default false,
  add column if not exists source_key text,
  add column if not exists sort_order integer not null default 0;

alter table public.teacher_announcement_assignments
  drop constraint if exists teacher_announcement_assignments_category_check,
  drop constraint if exists teacher_announcement_assignments_due_after_release_check,
  drop constraint if exists teacher_announcement_assignments_url_check;

alter table public.teacher_announcement_assignments
  add constraint teacher_announcement_assignments_category_check
    check (category is null or category in ('assessments', 'participation', 'performance_tasks', 'portfolio')),
  add constraint teacher_announcement_assignments_due_after_release_check
    check (due_date is null or due_date >= assignment_date),
  add constraint teacher_announcement_assignments_url_check
    check (url is null or url ~* '^https?://');

-- Stable identity for syllabus imports, so rerunning setup never duplicates a
-- row or overwrites one the teacher has edited.
create unique index if not exists teacher_announcement_assignments_course_source_key_idx
  on public.teacher_announcement_assignments (course_id, source_key)
  where source_key is not null;

create index if not exists teacher_announcement_assignments_course_due_idx
  on public.teacher_announcement_assignments (course_id, due_date);

create index if not exists teacher_announcement_assignments_lesson_idx
  on public.teacher_announcement_assignments (lesson_id);

comment on column public.teacher_announcement_assignments.assignment_date is
  'Local (course timezone) calendar date the assignment is released.';
comment on column public.teacher_announcement_assignments.due_date is
  'Local (course timezone) calendar date the assignment is due.';
comment on column public.teacher_announcement_assignments.release_time is
  'Local wall-clock release time in the course timezone; null when unknown.';
comment on column public.teacher_announcement_assignments.due_time is
  'Local wall-clock due time in the course timezone; null when unknown.';
comment on column public.teacher_announcement_assignments.is_draft is
  'True while a provider link, code, or other required detail is still missing.';
comment on column public.teacher_announcement_assignments.source_key is
  'Stable import identity (e.g. syllabus row + item); null for hand-made rows.';
