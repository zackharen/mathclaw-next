drop function if exists public.list_course_game_leaderboard(uuid, text);

create function public.list_course_game_leaderboard(p_course_id uuid, p_game_slug text)
returns table (
  player_id uuid,
  display_name text,
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
    from public.courses c
    where c.id = p_course_id
      and (
        c.owner_id = auth.uid()
        or exists (
          select 1
          from public.student_course_memberships scm
          where scm.course_id = c.id
            and scm.profile_id = auth.uid()
        )
      )
  ) then
    return;
  end if;

  return query
  select
    cgps.player_id,
    (
      coalesce(nullif(trim(p.display_name), ''), 'Student ' || left(cgps.player_id::text, 8))
      || case when cgps.player_id = c.owner_id then ' - Teacher' else '' end
    ) as display_name,
    cgps.average_score,
    cgps.last_10_average,
    cgps.best_score,
    cgps.sessions_played
  from public.course_game_player_stats cgps
  join public.courses c on c.id = cgps.course_id
  left join public.profiles p on p.id = cgps.player_id
  where cgps.course_id = p_course_id
    and cgps.game_slug = p_game_slug
  order by cgps.average_score desc, cgps.best_score desc, cgps.updated_at desc
  limit 25;
end;
$$;

grant execute on function public.list_course_game_leaderboard(uuid, text) to authenticated;
