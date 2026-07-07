alter table public.double_board_questions
  add column if not exists claimed_by_user_id uuid,
  add column if not exists claimed_by_display_name text,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists locked_user_id uuid;

create or replace function public.double_board_claim_question(
  p_question_id uuid,
  p_session_id uuid,
  p_user_id uuid,
  p_display_name text,
  p_claim_seconds integer
)
returns setof public.double_board_questions
language sql
as $$
  update public.double_board_questions
  set claimed_by_user_id = p_user_id,
      claimed_by_display_name = p_display_name,
      claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => greatest(1, coalesce(p_claim_seconds, 10))),
      locked_user_id = null,
      updated_at = now()
  where id = p_question_id
    and session_id = p_session_id
    and solved = false
    and (
      claimed_by_user_id is null
      or claimed_by_user_id = p_user_id
      or claim_expires_at < now()
    )
    and locked_user_id is distinct from p_user_id
  returning *;
$$;
