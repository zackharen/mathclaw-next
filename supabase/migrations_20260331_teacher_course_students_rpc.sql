create or replace function public.list_course_students(p_course_id uuid)
returns table (
  profile_id uuid,
  joined_at timestamptz,
  display_name text,
  school_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if not exists (
    select 1
    from public.courses
    where public.courses.id = p_course_id
      and public.courses.owner_id = auth.uid()
  ) then
    return;
  end if;

  return query
  select
    scm.profile_id,
    scm.joined_at,
    p.display_name,
    p.school_name
  from public.student_course_memberships scm
  left join public.profiles p on p.id = scm.profile_id
  where scm.course_id = p_course_id
  order by scm.joined_at desc;
end;
$$;

grant execute on function public.list_course_students(uuid) to authenticated;
