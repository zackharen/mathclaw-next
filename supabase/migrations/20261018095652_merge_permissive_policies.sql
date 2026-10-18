-- Merge overlapping permissive RLS policies (advisor: multiple_permissive_policies).
-- Postgres ORs every permissive policy for a command, so each table gets one policy
-- per command whose predicate is the OR of the old ones. Access is unchanged; the
-- planner just evaluates one policy instead of several. When applied to production
-- (2026-10-18) the migration also snapshotted what 31 real users could read or lock
-- for update across these tables and aborted on any difference; there were none.

-- courses ---------------------------------------------------------------------
drop policy if exists "courses: owner" on public.courses;
drop policy if exists courses_select_owner on public.courses;
drop policy if exists courses_insert_owner on public.courses;
drop policy if exists courses_update_owner on public.courses;
drop policy if exists courses_delete_owner on public.courses;
drop policy if exists "courses: co-teacher read" on public.courses;
drop policy if exists "courses: enrolled student read" on public.courses;

create policy "courses: owner, co-teacher or enrolled student read" on public.courses
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or rls_is_co_teacher_of_course((select auth.uid()), id)
    or (archived_at is null and rls_is_enrolled_in_course((select auth.uid()), id))
  );
create policy "courses: owner insert" on public.courses
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "courses: owner update" on public.courses
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "courses: owner delete" on public.courses
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- profiles --------------------------------------------------------------------
drop policy if exists "profiles: self" on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists "profiles: classmates readable" on public.profiles;
drop policy if exists "profiles: co-teacher reads class members" on public.profiles;
drop policy if exists "profiles: teacher reads class members" on public.profiles;
drop policy if exists "profiles: discoverable teachers" on public.profiles;

create policy "profiles: self, class members or discoverable teachers read" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (discoverable = true and account_type = 'teacher')
    or rls_teacher_owns_course_of_student((select auth.uid()), id)
    or rls_co_teacher_of_student((select auth.uid()), id)
    or rls_are_classmates((select auth.uid()), id)
  );
create policy "profiles: self insert" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles: self update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy "profiles: self delete" on public.profiles
  for delete to authenticated
  using (id = (select auth.uid()));

-- lesson_resource_shares ------------------------------------------------------
drop policy if exists "Lesson resource owners manage direct shares" on public.lesson_resource_shares;
drop policy if exists "Shared teachers can read direct share grants" on public.lesson_resource_shares;

create policy "Owners and shared teachers read direct shares" on public.lesson_resource_shares
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or exists (
      select 1 from public.lesson_resources resource
      where resource.id = lesson_resource_shares.resource_id
        and resource.owner_id = (select auth.uid())
    )
  );
create policy "Lesson resource owners insert direct shares" on public.lesson_resource_shares
  for insert to authenticated
  with check (exists (
    select 1 from public.lesson_resources resource
    where resource.id = lesson_resource_shares.resource_id
      and resource.owner_id = (select auth.uid())
  ));
create policy "Lesson resource owners update direct shares" on public.lesson_resource_shares
  for update to authenticated
  using (exists (
    select 1 from public.lesson_resources resource
    where resource.id = lesson_resource_shares.resource_id
      and resource.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.lesson_resources resource
    where resource.id = lesson_resource_shares.resource_id
      and resource.owner_id = (select auth.uid())
  ));
create policy "Lesson resource owners delete direct shares" on public.lesson_resource_shares
  for delete to authenticated
  using (exists (
    select 1 from public.lesson_resources resource
    where resource.id = lesson_resource_shares.resource_id
      and resource.owner_id = (select auth.uid())
  ));

-- teacher_resource_library_shares ---------------------------------------------
drop policy if exists "Owners manage resource library shares" on public.teacher_resource_library_shares;
drop policy if exists "Shared teachers can read library share grants" on public.teacher_resource_library_shares;

create policy "Owners and shared teachers read library shares" on public.teacher_resource_library_shares
  for select to authenticated
  using (owner_id = (select auth.uid()) or teacher_id = (select auth.uid()));
create policy "Owners insert library shares" on public.teacher_resource_library_shares
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owners update library shares" on public.teacher_resource_library_shares
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "Owners delete library shares" on public.teacher_resource_library_shares
  for delete to authenticated
  using (owner_id = (select auth.uid()));
