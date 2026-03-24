alter table public.courses
  add column if not exists student_join_code text;

update public.courses
set student_join_code = upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10))
where student_join_code is null;

create unique index if not exists courses_student_join_code_idx
on public.courses (student_join_code);

create table if not exists public.student_course_memberships (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (course_id, profile_id)
);

create index if not exists student_course_memberships_profile_idx
on public.student_course_memberships (profile_id);

create index if not exists student_course_memberships_course_idx
on public.student_course_memberships (course_id);

create table if not exists public.games (
  slug text primary key,
  name text not null,
  category text not null check (category in ('arcade', 'multiplayer', 'math_skills')),
  description text,
  is_multiplayer boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  game_slug text not null references public.games (slug) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  score numeric not null default 0,
  result text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists game_sessions_player_game_created_idx
on public.game_sessions (player_id, game_slug, created_at desc);

create index if not exists game_sessions_course_game_idx
on public.game_sessions (course_id, game_slug, created_at desc);

create table if not exists public.game_player_global_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  game_slug text not null references public.games (slug) on delete cascade,
  sessions_played integer not null default 0,
  total_score numeric not null default 0,
  average_score numeric not null default 0,
  last_10_average numeric not null default 0,
  best_score numeric not null default 0,
  skill_rating numeric not null default 1,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (player_id, game_slug)
);

create index if not exists game_player_global_stats_game_idx
on public.game_player_global_stats (game_slug, average_score desc);

create table if not exists public.course_game_player_stats (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  game_slug text not null references public.games (slug) on delete cascade,
  sessions_played integer not null default 0,
  total_score numeric not null default 0,
  average_score numeric not null default 0,
  last_10_average numeric not null default 0,
  best_score numeric not null default 0,
  skill_rating numeric not null default 1,
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (course_id, player_id, game_slug)
);

create index if not exists course_game_player_stats_course_game_idx
on public.course_game_player_stats (course_id, game_slug, average_score desc);

create table if not exists public.connect4_matches (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  course_id uuid references public.courses (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  player_one_id uuid not null references public.profiles (id) on delete cascade,
  player_two_id uuid references public.profiles (id) on delete set null,
  current_turn_id uuid references public.profiles (id) on delete set null,
  winner_id uuid references public.profiles (id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  board jsonb not null default '[]'::jsonb,
  move_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists connect4_matches_invite_code_idx
on public.connect4_matches (invite_code);

create index if not exists connect4_matches_player_one_idx
on public.connect4_matches (player_one_id, updated_at desc);

create index if not exists connect4_matches_player_two_idx
on public.connect4_matches (player_two_id, updated_at desc);

alter table public.student_course_memberships enable row level security;
alter table public.games enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_player_global_stats enable row level security;
alter table public.course_game_player_stats enable row level security;
alter table public.connect4_matches enable row level security;

create policy "student memberships own or teacher select"
on public.student_course_memberships
for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.courses
    where courses.id = student_course_memberships.course_id
      and courses.owner_id = auth.uid()
  )
);

create policy "student memberships self insert"
on public.student_course_memberships
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1 from public.courses where courses.id = student_course_memberships.course_id
  )
);

create policy "student memberships self or teacher delete"
on public.student_course_memberships
for delete
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.courses
    where courses.id = student_course_memberships.course_id
      and courses.owner_id = auth.uid()
  )
);

create policy "games authenticated select"
on public.games
for select
to authenticated
using (true);

create policy "game sessions own or teacher select"
on public.game_sessions
for select
to authenticated
using (
  player_id = auth.uid()
  or (
    course_id is not null
    and exists (
      select 1 from public.courses
      where courses.id = game_sessions.course_id
        and courses.owner_id = auth.uid()
    )
  )
);

create policy "game sessions self insert"
on public.game_sessions
for insert
to authenticated
with check (
  player_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.courses
      where courses.id = game_sessions.course_id
        and (
          courses.owner_id = auth.uid()
          or exists (
            select 1
            from public.student_course_memberships
            where student_course_memberships.course_id = game_sessions.course_id
              and student_course_memberships.profile_id = auth.uid()
          )
        )
    )
  )
);

create policy "global stats self select"
on public.game_player_global_stats
for select
to authenticated
using (player_id = auth.uid());

create policy "global stats self insert"
on public.game_player_global_stats
for insert
to authenticated
with check (player_id = auth.uid());

create policy "global stats self update"
on public.game_player_global_stats
for update
to authenticated
using (player_id = auth.uid())
with check (player_id = auth.uid());

create policy "course stats own or teacher select"
on public.course_game_player_stats
for select
to authenticated
using (
  player_id = auth.uid()
  or exists (
    select 1
    from public.courses
    where courses.id = course_game_player_stats.course_id
      and courses.owner_id = auth.uid()
  )
);

create policy "course stats self insert"
on public.course_game_player_stats
for insert
to authenticated
with check (
  player_id = auth.uid()
  and exists (
    select 1
    from public.courses
    where courses.id = course_game_player_stats.course_id
      and (
        courses.owner_id = auth.uid()
        or exists (
          select 1
          from public.student_course_memberships
          where student_course_memberships.course_id = course_game_player_stats.course_id
            and student_course_memberships.profile_id = auth.uid()
        )
      )
  )
);

create policy "course stats self update"
on public.course_game_player_stats
for update
to authenticated
using (player_id = auth.uid())
with check (
  player_id = auth.uid()
  and exists (
    select 1
    from public.courses
    where courses.id = course_game_player_stats.course_id
      and (
        courses.owner_id = auth.uid()
        or exists (
          select 1
          from public.student_course_memberships
          where student_course_memberships.course_id = course_game_player_stats.course_id
            and student_course_memberships.profile_id = auth.uid()
        )
      )
  )
);

create policy "connect4 participants or teacher select"
on public.connect4_matches
for select
to authenticated
using (
  created_by = auth.uid()
  or player_one_id = auth.uid()
  or player_two_id = auth.uid()
  or (
    course_id is not null
    and exists (
      select 1
      from public.courses
      where courses.id = connect4_matches.course_id
        and courses.owner_id = auth.uid()
    )
  )
);

create policy "connect4 creator insert"
on public.connect4_matches
for insert
to authenticated
with check (
  created_by = auth.uid()
  and player_one_id = auth.uid()
);

create policy "connect4 participant update"
on public.connect4_matches
for update
to authenticated
using (
  created_by = auth.uid()
  or player_one_id = auth.uid()
  or player_two_id = auth.uid()
)
with check (
  created_by = auth.uid()
  or player_one_id = auth.uid()
  or player_two_id = auth.uid()
);

insert into public.games (slug, name, category, description, is_multiplayer)
values
  ('2048', '2048', 'arcade', 'Merge tiles and chase higher scores.', false),
  ('connect4', 'Connect4', 'multiplayer', 'Play head-to-head with an invite code.', true),
  ('integer_practice', 'Adding & Subtracting Integers', 'math_skills', 'Adaptive integer fluency practice.', false),
  ('number_compare', 'Which Number Is Bigger?', 'math_skills', 'Compare decimals, negatives, fractions, and more.', false)
on conflict (slug) do nothing;
