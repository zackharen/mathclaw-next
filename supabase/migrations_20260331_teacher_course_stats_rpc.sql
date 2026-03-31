create or replace function public.list_course_student_stats(p_course_id uuid)
returns table (
  player_id uuid,
  game_slug text,
  average_score numeric,
  last_10_average numeric,
  best_score numeric,
  sessions_played integer
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
    cgps.player_id,
    cgps.game_slug,
    cgps.average_score,
    cgps.last_10_average,
    cgps.best_score,
    cgps.sessions_played
  from public.course_game_player_stats cgps
  where cgps.course_id = p_course_id
  order by cgps.player_id, cgps.game_slug;
end;
$$;

grant execute on function public.list_course_student_stats(uuid) to authenticated;
