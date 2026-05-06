create table if not exists public.connect4_tournaments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  bracket jsonb not null default '{}'::jsonb,
  champion_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists connect4_tournaments_course_status_idx
on public.connect4_tournaments (course_id, status, updated_at desc);

create table if not exists public.connect4_tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.connect4_tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null default 'Student',
  seed integer,
  status text not null default 'active' check (status in ('active', 'eliminated', 'winner')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index if not exists connect4_tournament_participants_tournament_idx
on public.connect4_tournament_participants (tournament_id, updated_at desc);

create index if not exists connect4_tournament_participants_user_idx
on public.connect4_tournament_participants (user_id, updated_at desc);

create table if not exists public.connect4_tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.connect4_tournaments (id) on delete cascade,
  connect4_match_id uuid references public.connect4_matches (id) on delete set null,
  round_index integer not null,
  match_index integer not null,
  player_one_id uuid references public.profiles (id) on delete set null,
  player_two_id uuid references public.profiles (id) on delete set null,
  winner_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'active', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, round_index, match_index)
);

create index if not exists connect4_tournament_matches_tournament_round_idx
on public.connect4_tournament_matches (tournament_id, round_index, match_index);

create index if not exists connect4_tournament_matches_connect4_match_idx
on public.connect4_tournament_matches (connect4_match_id);

alter table public.connect4_tournaments enable row level security;
alter table public.connect4_tournament_participants enable row level security;
alter table public.connect4_tournament_matches enable row level security;

create policy "connect4 tournaments class members select"
on public.connect4_tournaments
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.courses
    where courses.id = connect4_tournaments.course_id
      and courses.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.course_members
    where course_members.course_id = connect4_tournaments.course_id
      and course_members.profile_id = auth.uid()
      and course_members.role in ('owner', 'editor')
  )
  or exists (
    select 1
    from public.student_course_memberships
    where student_course_memberships.course_id = connect4_tournaments.course_id
      and student_course_memberships.profile_id = auth.uid()
  )
);

create policy "connect4 tournaments teachers insert"
on public.connect4_tournaments
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    exists (
      select 1
      from public.courses
      where courses.id = connect4_tournaments.course_id
        and courses.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.course_members
      where course_members.course_id = connect4_tournaments.course_id
        and course_members.profile_id = auth.uid()
        and course_members.role in ('owner', 'editor')
    )
  )
);

create policy "connect4 tournaments teachers update"
on public.connect4_tournaments
for update
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.courses
    where courses.id = connect4_tournaments.course_id
      and courses.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.course_members
    where course_members.course_id = connect4_tournaments.course_id
      and course_members.profile_id = auth.uid()
      and course_members.role in ('owner', 'editor')
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1
    from public.courses
    where courses.id = connect4_tournaments.course_id
      and courses.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.course_members
    where course_members.course_id = connect4_tournaments.course_id
      and course_members.profile_id = auth.uid()
      and course_members.role in ('owner', 'editor')
  )
);

create policy "connect4 tournament participants class select"
on public.connect4_tournament_participants
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.connect4_tournaments
    where connect4_tournaments.id = connect4_tournament_participants.tournament_id
      and (
        connect4_tournaments.created_by = auth.uid()
        or exists (
          select 1
          from public.courses
          where courses.id = connect4_tournaments.course_id
            and courses.owner_id = auth.uid()
        )
        or exists (
          select 1
          from public.course_members
          where course_members.course_id = connect4_tournaments.course_id
            and course_members.profile_id = auth.uid()
            and course_members.role in ('owner', 'editor')
        )
        or exists (
          select 1
          from public.student_course_memberships
          where student_course_memberships.course_id = connect4_tournaments.course_id
            and student_course_memberships.profile_id = auth.uid()
        )
      )
  )
);

create policy "connect4 tournament participants self insert"
on public.connect4_tournament_participants
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.connect4_tournaments
    join public.student_course_memberships
      on student_course_memberships.course_id = connect4_tournaments.course_id
    where connect4_tournaments.id = connect4_tournament_participants.tournament_id
      and student_course_memberships.profile_id = auth.uid()
  )
);

create policy "connect4 tournament participants self update"
on public.connect4_tournament_participants
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.connect4_tournaments
    join public.student_course_memberships
      on student_course_memberships.course_id = connect4_tournaments.course_id
    where connect4_tournaments.id = connect4_tournament_participants.tournament_id
      and student_course_memberships.profile_id = auth.uid()
  )
);

create policy "connect4 tournament matches class select"
on public.connect4_tournament_matches
for select
to authenticated
using (
  player_one_id = auth.uid()
  or player_two_id = auth.uid()
  or exists (
    select 1
    from public.connect4_tournaments
    where connect4_tournaments.id = connect4_tournament_matches.tournament_id
      and (
        connect4_tournaments.created_by = auth.uid()
        or exists (
          select 1
          from public.courses
          where courses.id = connect4_tournaments.course_id
            and courses.owner_id = auth.uid()
        )
        or exists (
          select 1
          from public.course_members
          where course_members.course_id = connect4_tournaments.course_id
            and course_members.profile_id = auth.uid()
            and course_members.role in ('owner', 'editor')
        )
        or exists (
          select 1
          from public.student_course_memberships
          where student_course_memberships.course_id = connect4_tournaments.course_id
            and student_course_memberships.profile_id = auth.uid()
        )
      )
  )
);
