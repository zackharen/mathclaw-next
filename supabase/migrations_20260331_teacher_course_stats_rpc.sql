create or replace function public.list_course_student_stats(p_course_id uuid)
returns table (
  player_id uuid,
  game_slug text,
  average_score numeric,
  last_10_average numeric,
  best_score numeric,
  sessions_played integer,
  stat_scope text
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
  with members as (
    select scm.profile_id
    from public.student_course_memberships scm
    where scm.course_id = p_course_id
  ),
  course_stats as (
    select
      cgps.player_id,
      cgps.game_slug,
      cgps.average_score,
      cgps.last_10_average,
      cgps.best_score,
      cgps.sessions_played,
      'course'::text as stat_scope
    from public.course_game_player_stats cgps
    where cgps.course_id = p_course_id
  ),
  fallback_global_stats as (
    select
      gpgs.player_id,
      gpgs.game_slug,
      gpgs.average_score,
      gpgs.last_10_average,
      gpgs.best_score,
      gpgs.sessions_played,
      'global_fallback'::text as stat_scope
    from public.game_player_global_stats gpgs
    join members on members.profile_id = gpgs.player_id
    where not exists (
      select 1
      from public.course_game_player_stats cgps
      where cgps.course_id = p_course_id
        and cgps.player_id = gpgs.player_id
        and cgps.game_slug = gpgs.game_slug
    )
  )
  select *
  from (
    select * from course_stats
    union all
    select * from fallback_global_stats
  ) stats
  order by stats.player_id, stats.game_slug;
end;
$$;

grant execute on function public.list_course_student_stats(uuid) to authenticated;
