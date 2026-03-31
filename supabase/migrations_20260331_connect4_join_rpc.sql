drop function if exists public.join_connect4_match_by_code(text);

create function public.join_connect4_match_by_code(p_invite_code text)
returns table (
  id uuid,
  invite_code text,
  course_id uuid,
  created_by uuid,
  player_one_id uuid,
  player_two_id uuid,
  current_turn_id uuid,
  winner_id uuid,
  status text,
  board jsonb,
  move_count integer,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  target_match public.connect4_matches%rowtype;
begin
  if auth.uid() is null then
    return;
  end if;

  normalized_code := upper(trim(coalesce(p_invite_code, '')));
  if normalized_code = '' then
    return;
  end if;

  select *
  into target_match
  from public.connect4_matches
  where public.connect4_matches.invite_code = normalized_code
  limit 1;

  if target_match.id is null then
    return;
  end if;

  if target_match.player_two_id is not null and target_match.player_two_id <> auth.uid() then
    raise exception 'This match already has two players';
  end if;

  update public.connect4_matches
  set
    player_two_id = coalesce(target_match.player_two_id, auth.uid()),
    status = case when target_match.player_one_id = auth.uid() then target_match.status else 'active' end,
    updated_at = now()
  where public.connect4_matches.id = target_match.id
  returning
    public.connect4_matches.id,
    public.connect4_matches.invite_code,
    public.connect4_matches.course_id,
    public.connect4_matches.created_by,
    public.connect4_matches.player_one_id,
    public.connect4_matches.player_two_id,
    public.connect4_matches.current_turn_id,
    public.connect4_matches.winner_id,
    public.connect4_matches.status,
    public.connect4_matches.board,
    public.connect4_matches.move_count,
    public.connect4_matches.metadata,
    public.connect4_matches.created_at,
    public.connect4_matches.updated_at
  into
    id,
    invite_code,
    course_id,
    created_by,
    player_one_id,
    player_two_id,
    current_turn_id,
    winner_id,
    status,
    board,
    move_count,
    metadata,
    created_at,
    updated_at;

  return next;
end;
$$;

grant execute on function public.join_connect4_match_by_code(text) to authenticated;
