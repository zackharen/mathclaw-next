-- Security pass 2026-10-27.
-- 1. Site settings (feature flags, homepage copy, integer mastery settings) are
--    stored as game_sessions rows written by the owner through the service role.
--    Signed-in users could previously write rows with those slugs through
--    record_game_session or a direct insert and change the site. Block them.
-- 2. Cap per-game scores in the database too (same ceilings as
--    app/api/play/session/route.js), so direct RPC calls can't post fake scores.
-- 3. Leaderboard tables are only written by record_game_session (security
--    definer), so signed-in users lose direct insert/update on them.

create or replace function public.game_score_ceiling(p_game_slug text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_game_slug
    when '2048' then 500000
    when 'connect4' then 1
    when 'integer_practice' then 500
    when 'money_counting' then 500
    when 'minesweeper' then 10000
    when 'number_compare' then 500
    when 'telling_time' then 500
    when 'locker_practice' then 100
    when 'slope_intercept' then 500
    when 'sudoku' then 500
    when 'spiral_review' then 500
    when 'question_kind_review' then 500
    when 'double_board_review' then 2000
    when 'skill_builder' then 500
    when 'showdown_framework' then 500
    when 'comet_typing' then 10000
    else 1000
  end::numeric
$$;

create or replace function public.is_reserved_game_slug(p_game_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_game_slug, '') in ('site_feature_flags', 'site_copy_settings', 'integer_mastery_settings')
    or coalesce(p_game_slug, '') like '%\_settings' escape '\'
$$;

drop policy if exists "game sessions self insert" on public.game_sessions;
create policy "game sessions self insert" on public.game_sessions
for insert to authenticated
with check (
  player_id = (select auth.uid())
  and not public.is_reserved_game_slug(game_slug)
  and score >= 0
  and score <= public.game_score_ceiling(game_slug)
  and (
    course_id is null
    or exists (
      select 1 from public.courses
      where courses.id = game_sessions.course_id
        and (
          courses.owner_id = (select auth.uid())
          or exists (
            select 1 from public.student_course_memberships
            where student_course_memberships.course_id = game_sessions.course_id
              and student_course_memberships.profile_id = (select auth.uid())
          )
        )
    )
  )
);

drop policy if exists "global stats self insert" on public.game_player_global_stats;
drop policy if exists "global stats self update" on public.game_player_global_stats;
drop policy if exists "course stats self insert" on public.course_game_player_stats;
drop policy if exists "course stats self update" on public.course_game_player_stats;

do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.record_game_session(text,numeric,text,jsonb,uuid)'::regprocedure);
  def := replace(
    def,
    E'  if auth.uid() is null then\n    return;\n  end if;\n',
    E'  if auth.uid() is null then\n    return;\n  end if;\n\n  if public.is_reserved_game_slug(p_game_slug)\n     or not exists (select 1 from public.games g where g.slug = p_game_slug) then\n    raise exception ''Unsupported game'';\n  end if;\n\n  p_score := least(greatest(coalesce(p_score, 0), 0), public.game_score_ceiling(p_game_slug));\n'
  );
  if position('is_reserved_game_slug' in def) = 0 then
    raise exception 'record_game_session body did not match; nothing changed';
  end if;
  execute def;
end
$$;
