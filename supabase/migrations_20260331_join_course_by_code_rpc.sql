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

grant execute on function public.join_course_by_code(text) to authenticated;
