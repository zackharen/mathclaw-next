-- Formalizes the course_members table that was previously only defined in schema.sql.
-- This table tracks co-teacher assignments: users who have owner/editor/viewer
-- access to a course without being the primary owner.
--
-- The table was created directly in production on 2026-04-24 when the RLS audit
-- revealed that migrations_20260423_profiles_courses_rls.sql referenced it but
-- no migration had ever created it. This file makes the creation idempotent so
-- staging and any future databases stay consistent.

create table if not exists public.course_members (
  course_id  uuid not null references public.courses  (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (course_id, profile_id)
);

create index if not exists course_members_profile_idx
  on public.course_members (profile_id);
