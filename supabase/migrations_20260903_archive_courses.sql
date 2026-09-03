alter table if exists public.courses
add column if not exists archived_at timestamptz;

create index if not exists courses_owner_active_idx
on public.courses (owner_id, created_at desc)
where archived_at is null;

drop policy if exists "courses: enrolled student read" on public.courses;

create policy "courses: enrolled student read"
on public.courses
for select
to authenticated
using (
  archived_at is null
  and exists (
    select 1
    from public.student_course_memberships
    where student_course_memberships.course_id = courses.id
      and student_course_memberships.profile_id = (select auth.uid())
  )
);

create or replace function public.list_accessible_courses()
returns table (
  id uuid,
  title text,
  class_name text,
  student_join_code text,
  owner_id uuid,
  relationship text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  with owned as (
    select
      c.id,
      c.title,
      c.class_name,
      c.student_join_code,
      c.owner_id,
      'owner'::text as relationship,
      c.created_at as sort_at
    from public.courses c
    where c.owner_id = auth.uid()
      and c.archived_at is null
  ),
  joined as (
    select
      c.id,
      c.title,
      c.class_name,
      c.student_join_code,
      c.owner_id,
      'student'::text as relationship,
      scm.joined_at as sort_at
    from public.student_course_memberships scm
    join public.courses c on c.id = scm.course_id
    where scm.profile_id = auth.uid()
      and c.owner_id <> auth.uid()
      and c.archived_at is null
  ),
  shared as (
    select
      c.id,
      c.title,
      c.class_name,
      c.student_join_code,
      c.owner_id,
      'co_teacher'::text as relationship,
      c.created_at as sort_at
    from public.course_members cm
    join public.courses c on c.id = cm.course_id
    where cm.profile_id = auth.uid()
      and cm.role in ('owner', 'editor')
      and c.owner_id <> auth.uid()
      and c.archived_at is null
  ),
  combined as (
    select * from owned
    union all
    select * from joined
    union all
    select * from shared
  )
  select distinct on (combined.id)
    combined.id,
    combined.title,
    combined.class_name,
    combined.student_join_code,
    combined.owner_id,
    combined.relationship
  from combined
  order by combined.id, combined.sort_at desc nulls last;
end;
$$;

create or replace function public.list_editable_courses()
returns table (
  id uuid,
  title text,
  class_name text,
  schedule_model text,
  ab_meeting_day text,
  school_year_start date,
  school_year_end date,
  student_join_code text,
  owner_id uuid,
  created_at timestamptz,
  membership_role text,
  is_shared_course boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  with owned as (
    select
      c.id,
      c.title,
      c.class_name,
      c.schedule_model,
      c.ab_meeting_day,
      c.school_year_start,
      c.school_year_end,
      c.student_join_code,
      c.owner_id,
      c.created_at,
      'owner'::text as membership_role,
      false as is_shared_course
    from public.courses c
    where c.owner_id = auth.uid()
      and c.archived_at is null
  ),
  shared as (
    select
      c.id,
      c.title,
      c.class_name,
      c.schedule_model,
      c.ab_meeting_day,
      c.school_year_start,
      c.school_year_end,
      c.student_join_code,
      c.owner_id,
      c.created_at,
      coalesce(cm.role, 'editor')::text as membership_role,
      true as is_shared_course
    from public.course_members cm
    join public.courses c on c.id = cm.course_id
    where cm.profile_id = auth.uid()
      and cm.role in ('owner', 'editor')
      and c.owner_id <> auth.uid()
      and c.archived_at is null
  )
  select *
  from (
    select * from owned
    union all
    select * from shared
  ) editable
  order by editable.created_at desc;
end;
$$;

create or replace function public.join_course_by_code(p_join_code text)
returns table (
  id uuid,
  owner_id uuid,
  title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
begin
  normalized_code := upper(regexp_replace(coalesce(p_join_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if normalized_code = '' then
    return;
  end if;

  return query
  with matched_course as (
    select courses.id, courses.owner_id, courses.title
    from public.courses
    where upper(courses.student_join_code) = normalized_code
      and courses.archived_at is null
    order by courses.updated_at desc nulls last, courses.created_at desc nulls last
    limit 1
  ), inserted_membership as (
    insert into public.student_course_memberships (course_id, profile_id)
    select matched_course.id, auth.uid()
    from matched_course
    where matched_course.owner_id <> auth.uid()
      and auth.uid() is not null
    on conflict (course_id, profile_id) do nothing
    returning course_id
  )
  select matched_course.id, matched_course.owner_id, matched_course.title
  from matched_course;
end;
$$;

revoke execute on function public.list_accessible_courses() from public, anon;
revoke execute on function public.list_editable_courses() from public, anon;
revoke execute on function public.join_course_by_code(text) from public, anon;

grant execute on function public.list_accessible_courses() to authenticated;
grant execute on function public.list_editable_courses() to authenticated;
grant execute on function public.join_course_by_code(text) to authenticated;
