-- Enable Row Level Security on `profiles` and `courses`.
-- These tables previously had no RLS, meaning any authenticated user could query
-- all rows — exposing all teacher/student names, school names, and class join codes.
--
-- All server actions and API routes that need unrestricted access already use the
-- service-role admin client (createAdminClient), which bypasses RLS.
-- The policies below cover all user-scoped (anon JWT) access paths in the app.

-- ============================================================
-- profiles
-- ============================================================

alter table public.profiles enable row level security;

-- Every user can read and write their own profile row.
create policy "profiles: self"
on public.profiles
for all
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Discoverable teachers are visible to all authenticated users
-- (needed for the teacher search / directory surface at /teachers).
create policy "profiles: discoverable teachers"
on public.profiles
for select
to authenticated
using (
  discoverable = true
  and account_type = 'teacher'
);

-- Teachers can read profiles of students enrolled in their classes
-- (needed for student lists, leaderboard display names, award flows).
create policy "profiles: teacher reads class members"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.student_course_memberships scm
    join public.courses c on c.id = scm.course_id
    where scm.profile_id = profiles.id
      and c.owner_id = auth.uid()
  )
);

-- Co-teachers can read profiles of students in their shared classes.
create policy "profiles: co-teacher reads class members"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.student_course_memberships scm
    join public.course_members cm
      on cm.course_id = scm.course_id
     and cm.profile_id = auth.uid()
     and cm.role in ('owner', 'editor')
    where scm.profile_id = profiles.id
  )
);

-- Students can read profiles of other students in the same class
-- (needed for leaderboard display names in /api/play/leaderboard).
create policy "profiles: classmates readable"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.student_course_memberships viewer_scm
    join public.student_course_memberships subject_scm
      on subject_scm.course_id = viewer_scm.course_id
     and subject_scm.profile_id = profiles.id
    where viewer_scm.profile_id = auth.uid()
  )
);

-- ============================================================
-- courses
-- ============================================================

alter table public.courses enable row level security;

-- Course owners have full access to their own courses.
create policy "courses: owner"
on public.courses
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Co-teachers (course_members with owner/editor role) can read shared courses.
create policy "courses: co-teacher read"
on public.courses
for select
to authenticated
using (
  exists (
    select 1
    from public.course_members
    where course_members.course_id = courses.id
      and course_members.profile_id = auth.uid()
      and course_members.role in ('owner', 'editor')
  )
);

-- Enrolled students can read their joined courses
-- (needed for /play arcade hub and game access checks).
create policy "courses: enrolled student read"
on public.courses
for select
to authenticated
using (
  exists (
    select 1
    from public.student_course_memberships
    where student_course_memberships.course_id = courses.id
      and student_course_memberships.profile_id = auth.uid()
  )
);
