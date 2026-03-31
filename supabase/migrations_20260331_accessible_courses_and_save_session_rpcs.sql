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
  ),
  combined as (
    select * from owned
    union all
    select * from joined
  )
  select
    combined.id,
    combined.title,
    combined.class_name,
    combined.student_join_code,
    combined.owner_id,
    combined.relationship
  from combined
  order by combined.sort_at desc nulls last;
end;
$$;

grant execute on function public.list_accessible_courses() to authenticated;

drop function if exists public.record_game_session(text, numeric, text, jsonb, uuid);

create function public.record_game_session(
  p_game_slug text,
  p_score numeric,
  p_result text,
  p_metadata jsonb default '{}'::jsonb,
  p_requested_course_id uuid default null
)
returns table (
  saved_course_id uuid,
  sessions_played integer,
  average_score numeric,
  last_10_average numeric,
  best_score numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_course_id uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  if p_requested_course_id is not null and exists (
    select 1
    from public.courses c
    where c.id = p_requested_course_id
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
    resolved_course_id := p_requested_course_id;
  else
    select scm.course_id
    into resolved_course_id
    from public.student_course_memberships scm
    where scm.profile_id = auth.uid()
    order by scm.joined_at desc
    limit 1;

    if resolved_course_id is null then
      select c.id
      into resolved_course_id
      from public.courses c
      where c.owner_id = auth.uid()
      order by c.created_at desc
      limit 1;
    end if;
  end if;

  insert into public.game_sessions (
    game_slug,
    player_id,
    course_id,
    score,
    result,
    metadata
  ) values (
    p_game_slug,
    auth.uid(),
    resolved_course_id,
    coalesce(p_score, 0),
    p_result,
    coalesce(p_metadata, '{}'::jsonb)
  );

  insert into public.game_player_global_stats (
    player_id,
    game_slug,
    sessions_played,
    total_score,
    average_score,
    last_10_average,
    best_score,
    skill_rating,
    stats,
    updated_at
  )
  select
    auth.uid(),
    p_game_slug,
    count(*)::integer,
    coalesce(sum(gs.score), 0),
    coalesce(avg(gs.score), 0),
    coalesce((
      select avg(recent.score)
      from (
        select gs2.score
        from public.game_sessions gs2
        where gs2.player_id = auth.uid()
          and gs2.game_slug = p_game_slug
        order by gs2.created_at desc
        limit 10
      ) recent
    ), 0),
    coalesce(max(gs.score), 0),
    coalesce((p_metadata->>'skillRating')::numeric, 1),
    coalesce(p_metadata, '{}'::jsonb),
    now()
  from public.game_sessions gs
  where gs.player_id = auth.uid()
    and gs.game_slug = p_game_slug
  on conflict (player_id, game_slug) do update
  set
    sessions_played = excluded.sessions_played,
    total_score = excluded.total_score,
    average_score = excluded.average_score,
    last_10_average = excluded.last_10_average,
    best_score = excluded.best_score,
    skill_rating = excluded.skill_rating,
    stats = excluded.stats,
    updated_at = excluded.updated_at;

  if resolved_course_id is not null then
    insert into public.course_game_player_stats (
      course_id,
      player_id,
      game_slug,
      sessions_played,
      total_score,
      average_score,
      last_10_average,
      best_score,
      skill_rating,
      stats,
      updated_at
    )
    select
      resolved_course_id,
      auth.uid(),
      p_game_slug,
      count(*)::integer,
      coalesce(sum(gs.score), 0),
      coalesce(avg(gs.score), 0),
      coalesce((
        select avg(recent.score)
        from (
          select gs2.score
          from public.game_sessions gs2
          where gs2.player_id = auth.uid()
            and gs2.game_slug = p_game_slug
            and gs2.course_id = resolved_course_id
          order by gs2.created_at desc
          limit 10
        ) recent
      ), 0),
      coalesce(max(gs.score), 0),
      coalesce((p_metadata->>'skillRating')::numeric, 1),
      coalesce(p_metadata, '{}'::jsonb),
      now()
    from public.game_sessions gs
    where gs.player_id = auth.uid()
      and gs.game_slug = p_game_slug
      and gs.course_id = resolved_course_id
    on conflict (course_id, player_id, game_slug) do update
    set
      sessions_played = excluded.sessions_played,
      total_score = excluded.total_score,
      average_score = excluded.average_score,
      last_10_average = excluded.last_10_average,
      best_score = excluded.best_score,
      skill_rating = excluded.skill_rating,
      stats = excluded.stats,
      updated_at = excluded.updated_at;
  end if;

  return query
  select
    resolved_course_id as saved_course_id,
    gps.sessions_played,
    gps.average_score,
    gps.last_10_average,
    gps.best_score
  from public.game_player_global_stats gps
  where gps.player_id = auth.uid()
    and gps.game_slug = p_game_slug;
end;
$$;

grant execute on function public.record_game_session(text, numeric, text, jsonb, uuid) to authenticated;
