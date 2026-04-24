-- Add 'player' to the profiles.account_type check constraint.
-- The 'player' account type was introduced after this constraint was defined,
-- causing new player accounts to silently receive the 'teacher' default.

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('teacher', 'student', 'player'));

-- Backfill: correct any player accounts that received the 'teacher' default
-- because the old constraint rejected 'player' and the fallback path wrote no account_type.
update public.profiles
set account_type = 'player'
where id in (
  select id from auth.users
  where raw_user_meta_data->>'account_type' = 'player'
)
and account_type = 'teacher';
