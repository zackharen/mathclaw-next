create table if not exists public.projector_polls (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.projector_sessions(id) on delete cascade,
  question text not null,
  question_type text not null default 'text' check (question_type in ('text', 'latex')),
  poll_type text not null check (poll_type in ('multiple_choice', 'thumbs', 'scale')),
  choices jsonb not null default '[]'::jsonb,
  target_screen_ids jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint projector_polls_question_length check (char_length(question) between 1 and 500),
  constraint projector_polls_choices_array check (jsonb_typeof(choices) = 'array'),
  constraint projector_polls_target_screen_ids_array check (jsonb_typeof(target_screen_ids) = 'array')
);

create table if not exists public.projector_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.projector_polls(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.projector_sessions(id) on delete cascade,
  screen_number integer not null check (screen_number between 1 and 12),
  screen_name text not null,
  student_name text,
  choice text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projector_poll_votes_student_name_length check (student_name is null or char_length(student_name) <= 40),
  constraint projector_poll_votes_unique_screen unique (poll_id, screen_number)
);

create index if not exists projector_polls_teacher_created_idx
  on public.projector_polls (teacher_id, created_at desc);

create unique index if not exists projector_polls_one_open_per_teacher_idx
  on public.projector_polls (teacher_id)
  where status = 'open';

create index if not exists projector_poll_votes_poll_updated_idx
  on public.projector_poll_votes (poll_id, updated_at desc);

alter table public.projector_polls enable row level security;
alter table public.projector_poll_votes enable row level security;

drop policy if exists "Teachers can manage their projector polls" on public.projector_polls;
create policy "Teachers can manage their projector polls"
on public.projector_polls
for all
to authenticated
using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

drop policy if exists "Teachers can manage their projector poll votes" on public.projector_poll_votes;
create policy "Teachers can manage their projector poll votes"
on public.projector_poll_votes
for all
to authenticated
using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

grant select, insert, update, delete on public.projector_polls to authenticated;
grant select, insert, update, delete on public.projector_poll_votes to authenticated;
