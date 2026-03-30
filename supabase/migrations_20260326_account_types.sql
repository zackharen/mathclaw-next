alter table public.profiles
  add column if not exists account_type text not null default 'teacher';

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('teacher', 'student'));

update public.profiles
set account_type = 'teacher'
where account_type is null;

create index if not exists profiles_account_type_idx
on public.profiles (account_type);
