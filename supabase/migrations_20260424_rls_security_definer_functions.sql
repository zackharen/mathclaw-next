-- Re-implement cross-user RLS policies via security definer functions.
--
-- Context: The policies added in migrations_20260423_profiles_courses_rls.sql caused
-- Postgres "infinite recursion detected in policy" errors in production because:
--
--   1. student_course_memberships has a pre-existing RLS policy that queries `courses`.
--   2. Any `courses` policy that queries `student_course_memberships` creates a loop:
--        courses policy → student_course_memberships RLS → courses policy → …
--   3. Any `profiles` policy that queries `student_course_memberships` also triggers the
--      same chain once `courses` has any RLS policy that touches that table.
--
-- Fix: Wrap all cross-table subquery logic in SECURITY DEFINER functions. These
-- functions execute as the function owner and bypass RLS on the tables they access,
-- cutting the recursion chain at every step.
--
-- The simple self-access policies (profiles:self, discoverable teachers, courses:owner)
-- are already live in production and are NOT touched here.

-- ============================================================
-- Security definer helper functions
-- ============================================================

-- Returns true if `uid` is enrolled in `course_id_in`.
-- Used by courses:enrolled-student-read to bypass the SCM→courses→SCM loop.
create or replace function public.rls_is_enrolled_in_course(uid uuid, course_id_in uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.student_course_memberships
    where profile_id = uid
      and course_id = course_id_in
  );
$$;

-- Returns true if `teacher_uid` owns a course that `student_uid` is enrolled in.
-- Used by profiles:teacher-reads-class-members.
create or replace function public.rls_teacher_owns_course_of_student(teacher_uid uuid, student_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.student_course_memberships scm
    join public.courses c on c.id = scm.course_id
    where scm.profile_id = student_uid
      and c.owner_id = teacher_uid
  );
$$;

-- Returns true if `co_teacher_uid` is a course_member (owner/editor) on a course
-- that `student_uid` is enrolled in.
-- Used by profiles:co-teacher-reads-class-members.
create or replace function public.rls_co_teacher_of_student(co_teacher_uid uuid, student_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.student_course_memberships scm
    join public.course_members cm on cm.course_id = scm.course_id
    where scm.profile_id = student_uid
      and cm.profile_id = co_teacher_uid
      and cm.role in ('owner', 'editor')
  );
$$;

-- Returns true if `uid1` and `uid2` share at least one enrolled course.
-- Used by profiles:classmates-readable.
create or replace function public.rls_are_classmates(uid1 uuid, uid2 uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.student_course_memberships scm1
    join public.student_course_memberships scm2
      on scm2.course_id = scm1.course_id
     and scm2.profile_id = uid2
    where scm1.profile_id = uid1
      and uid1 <> uid2
  );
$$;

-- Returns true if `co_teacher_uid` is listed in course_members for `course_id_in`.
-- Used by courses:co-teacher-read.
-- (course_members has no RLS so this function is a convenience wrapper for
-- consistency rather than a strict necessity, but keeping it here ensures
-- we can tighten course_members RLS later without changing policy SQL.)
create or replace function public.rls_is_co_teacher_of_course(co_teacher_uid uuid, course_id_in uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.course_members
    where course_id = course_id_in
      and profile_id = co_teacher_uid
      and role in ('owner', 'editor')
  );
$$;

-- ============================================================
-- Drop the old recursive policies (no-ops if already dropped)
-- ============================================================

drop policy if exists "profiles: teacher reads class members"      on public.profiles;
drop policy if exists "profiles: co-teacher reads class members"   on public.profiles;
drop policy if exists "profiles: classmates readable"              on public.profiles;
drop policy if exists "courses: enrolled student read"             on public.courses;
drop policy if exists "courses: co-teacher read"                   on public.courses;

-- ============================================================
-- Recreate them via the security definer wrappers
-- ============================================================

-- Teachers can read profiles of students enrolled in their classes.
create policy "profiles: teacher reads class members"
on public.profiles for select to authenticated
using (
  public.rls_teacher_owns_course_of_student(auth.uid(), id)
);

-- Co-teachers can read profiles of students in their shared classes.
create policy "profiles: co-teacher reads class members"
on public.profiles for select to authenticated
using (
  public.rls_co_teacher_of_student(auth.uid(), id)
);

-- Students can read profiles of classmates
-- (needed for leaderboard display names in /api/play/leaderboard).
create policy "profiles: classmates readable"
on public.profiles for select to authenticated
using (
  public.rls_are_classmates(auth.uid(), id)
);

-- Enrolled students can read their joined courses
-- (needed for /play arcade hub and game access checks).
create policy "courses: enrolled student read"
on public.courses for select to authenticated
using (
  public.rls_is_enrolled_in_course(auth.uid(), id)
);

-- Co-teachers can read courses they are assigned to.
create policy "courses: co-teacher read"
on public.courses for select to authenticated
using (
  public.rls_is_co_teacher_of_course(auth.uid(), id)
);
