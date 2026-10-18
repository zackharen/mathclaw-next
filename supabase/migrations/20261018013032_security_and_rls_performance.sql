-- Security and RLS performance tightening (2026-10-17).
-- No table data changes. Every statement is idempotent.

-- 1. Pin search_path on functions the advisor flagged as role-mutable.
alter function public.prevent_saved_games_auth_metadata() set search_path = public;
alter function public.limit_auth_user_metadata_size() set search_path = public;
alter function public.set_projector_room_profiles_updated_at() set search_path = public;
alter function public.set_projector_playlists_updated_at() set search_path = public;
alter function public.set_projector_room_schedule_blocks_updated_at() set search_path = public;
alter function public.set_teacher_bell_schedule_types_updated_at() set search_path = public;
alter function public.set_teacher_bell_schedule_blocks_updated_at() set search_path = public;
alter function public.double_board_claim_question(uuid, uuid, uuid, text, integer) set search_path = public;

-- 2. Signed-out callers never need these SECURITY DEFINER functions. The app calls
--    them only with a signed-in session, each returns nothing when auth.uid() is
--    null, and every policy that uses an rls_* helper is scoped to authenticated.
--    authenticated keeps its explicit EXECUTE grant.
revoke execute on function public.join_connect4_match_by_code(text) from public, anon;
revoke execute on function public.list_course_game_leaderboard(uuid, text) from public, anon;
revoke execute on function public.list_course_student_stats(uuid) from public, anon;
revoke execute on function public.list_course_students(uuid) from public, anon;
revoke execute on function public.record_game_session(text, numeric, text, jsonb, uuid) from public, anon;
revoke execute on function public.rls_are_classmates(uuid, uuid) from public, anon;
revoke execute on function public.rls_co_teacher_of_student(uuid, uuid) from public, anon;
revoke execute on function public.rls_is_co_teacher_of_course(uuid, uuid) from public, anon;
revoke execute on function public.rls_is_enrolled_in_course(uuid, uuid) from public, anon;
revoke execute on function public.rls_teacher_owns_course_of_student(uuid, uuid) from public, anon;

-- 3. Trigger functions on auth.users fire without an EXECUTE grant; nobody should
--    call them over /rest/v1/rpc.
revoke execute on function public.prevent_saved_games_auth_metadata() from public, anon, authenticated;
revoke execute on function public.limit_auth_user_metadata_size() from public, anon, authenticated;

-- 4. double_board_claim_question takes an arbitrary p_user_id. Only the Double Board
--    API route calls it, through the service-role client.
revoke execute on function public.double_board_claim_question(uuid, uuid, uuid, text, integer) from public, anon, authenticated;

-- 5. Evaluate auth.uid() once per statement instead of once per row in every
--    public policy (advisor: auth_rls_initplan). Same predicate, wrapped in a
--    scalar subquery; already-wrapped calls are left alone.
do $$
declare
  pol record;
  wrapped constant text := '( SELECT auth.uid() AS uid)';
  new_qual text;
  new_check text;
  stmt text;
begin
  for pol in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    new_qual := replace(replace(replace(pol.qual, wrapped, chr(1)), 'auth.uid()', wrapped), chr(1), wrapped);
    new_check := replace(replace(replace(pol.with_check, wrapped, chr(1)), 'auth.uid()', wrapped), chr(1), wrapped);
    if new_qual is distinct from pol.qual or new_check is distinct from pol.with_check then
      stmt := format('alter policy %I on public.%I', pol.policyname, pol.tablename);
      if new_qual is distinct from pol.qual then
        stmt := stmt || format(' using (%s)', new_qual);
      end if;
      if new_check is distinct from pol.with_check then
        stmt := stmt || format(' with check (%s)', new_check);
      end if;
      execute stmt;
    end if;
  end loop;
end
$$;

-- 6. Cover foreign keys the advisor flagged (small tables; builds are instant).
create index if not exists activities_provider_id_fk_idx on public.activities (provider_id);
create index if not exists activity_standards_standard_id_fk_idx on public.activity_standards (standard_id);
create index if not exists bug_reports_reporter_id_fk_idx on public.bug_reports (reporter_id);
create index if not exists bug_reports_resolved_by_fk_idx on public.bug_reports (resolved_by);
create index if not exists connect4_matches_course_id_fk_idx on public.connect4_matches (course_id);
create index if not exists connect4_matches_created_by_fk_idx on public.connect4_matches (created_by);
create index if not exists connect4_matches_current_turn_id_fk_idx on public.connect4_matches (current_turn_id);
create index if not exists connect4_matches_winner_id_fk_idx on public.connect4_matches (winner_id);
create index if not exists connect4_tournament_matches_player_one_id_fk_idx on public.connect4_tournament_matches (player_one_id);
create index if not exists connect4_tournament_matches_player_two_id_fk_idx on public.connect4_tournament_matches (player_two_id);
create index if not exists connect4_tournament_matches_winner_id_fk_idx on public.connect4_tournament_matches (winner_id);
create index if not exists connect4_tournaments_champion_id_fk_idx on public.connect4_tournaments (champion_id);
create index if not exists connect4_tournaments_created_by_fk_idx on public.connect4_tournaments (created_by);
create index if not exists course_calendar_days_reason_id_fk_idx on public.course_calendar_days (reason_id);
create index if not exists course_game_player_stats_game_slug_fk_idx on public.course_game_player_stats (game_slug);
create index if not exists course_game_player_stats_player_id_fk_idx on public.course_game_player_stats (player_id);
create index if not exists course_game_settings_updated_by_fk_idx on public.course_game_settings (updated_by);
create index if not exists course_lesson_plan_lesson_id_fk_idx on public.course_lesson_plan (lesson_id);
create index if not exists courses_selected_library_id_fk_idx on public.courses (selected_library_id);
create index if not exists double_board_attempts_player_id_fk_idx on public.double_board_attempts (player_id);
create index if not exists double_board_questions_solved_by_player_id_fk_idx on public.double_board_questions (solved_by_player_id);
create index if not exists game_sessions_game_slug_fk_idx on public.game_sessions (game_slug);
create index if not exists internal_event_logs_course_id_fk_idx on public.internal_event_logs (course_id);
create index if not exists internal_event_logs_user_id_fk_idx on public.internal_event_logs (user_id);
create index if not exists lowest_number_wins_picks_user_id_fk_idx on public.lowest_number_wins_picks (user_id);
create index if not exists lowest_number_wins_players_user_id_fk_idx on public.lowest_number_wins_players (user_id);
create index if not exists lowest_number_wins_sessions_course_id_fk_idx on public.lowest_number_wins_sessions (course_id);
create index if not exists lowest_number_wins_sessions_host_teacher_id_fk_idx on public.lowest_number_wins_sessions (host_teacher_id);
create index if not exists open_middle_players_user_id_fk_idx on public.open_middle_players (user_id);
create index if not exists open_middle_responses_template_version_id_fk_idx on public.open_middle_responses (template_version_id);
create index if not exists open_middle_responses_user_id_fk_idx on public.open_middle_responses (user_id);
create index if not exists open_middle_sessions_template_id_fk_idx on public.open_middle_sessions (template_id);
create index if not exists open_middle_sessions_template_version_id_fk_idx on public.open_middle_sessions (template_version_id);
create index if not exists projector_poll_votes_session_id_fk_idx on public.projector_poll_votes (session_id);
create index if not exists projector_poll_votes_teacher_id_fk_idx on public.projector_poll_votes (teacher_id);
create index if not exists projector_polls_session_id_fk_idx on public.projector_polls (session_id);
create index if not exists projector_room_schedule_blocks_course_id_fk_idx on public.projector_room_schedule_blocks (course_id);
create index if not exists projector_room_schedule_blocks_room_id_fk_idx on public.projector_room_schedule_blocks (room_id);
create index if not exists school_calendar_days_bell_schedule_type_id_fk_idx on public.school_calendar_days (bell_schedule_type_id);
create index if not exists school_calendar_days_reason_id_fk_idx on public.school_calendar_days (reason_id);
create index if not exists school_memberships_profile_id_fk_idx on public.school_memberships (profile_id);
create index if not exists schools_created_by_fk_idx on public.schools (created_by);
create index if not exists teacher_absences_course_id_fk_idx on public.teacher_absences (course_id);
create index if not exists teacher_announcement_assignment_rule_overrides_course_id_fk_idx on public.teacher_announcement_assignment_rule_overrides (course_id);
create index if not exists teacher_announcement_assignment_rule_overrides_rule_id_fk_idx on public.teacher_announcement_assignment_rule_overrides (rule_id);
create index if not exists teacher_announcement_assignment_rules_course_id_fk_idx on public.teacher_announcement_assignment_rules (course_id);
create index if not exists teacher_announcement_assignments_course_id_fk_idx on public.teacher_announcement_assignments (course_id);
create index if not exists teacher_bell_schedule_blocks_course_id_fk_idx on public.teacher_bell_schedule_blocks (course_id);
