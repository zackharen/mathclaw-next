drop function if exists public.list_editable_courses();

create function public.list_editable_courses()
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

grant execute on function public.list_editable_courses() to authenticated;
