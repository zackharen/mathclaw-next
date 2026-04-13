create table if not exists public.double_board_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses (id) on delete set null,
  host_teacher_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'live', 'ended')),
  number_mode text not null default 'single_digit' check (number_mode in ('single_digit', 'double_digit')),
  total_solved_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  results_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists double_board_sessions_course_status_idx
on public.double_board_sessions (course_id, status, updated_at desc);

create index if not exists double_board_sessions_host_idx
on public.double_board_sessions (host_teacher_id, updated_at desc);

create table if not exists public.double_board_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.double_board_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  role text not null default 'student' check (role in ('teacher', 'student')),
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists double_board_players_session_score_idx
on public.double_board_players (session_id, score desc, joined_at asc);

create index if not exists double_board_players_user_idx
on public.double_board_players (user_id, updated_at desc);

create table if not exists public.double_board_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.double_board_sessions (id) on delete cascade,
  board_key text not null check (board_key in ('A', 'B')),
  row_index integer not null check (row_index between 0 and 3),
  col_index integer not null check (col_index between 0 and 2),
  operand1 integer not null,
  operator text not null check (operator in ('+', '-')),
  operand2 integer not null,
  expression_text text not null,
  correct_answer integer not null,
  attempt_count integer not null default 0,
  solved boolean not null default false,
  solved_by_player_id uuid references public.profiles (id) on delete set null,
  solved_at timestamptz,
  ever_missed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, board_key, row_index, col_index)
);

create index if not exists double_board_questions_session_idx
on public.double_board_questions (session_id, board_key, row_index, col_index);

create index if not exists double_board_questions_session_state_idx
on public.double_board_questions (session_id, solved, ever_missed);

create table if not exists public.double_board_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.double_board_sessions (id) on delete cascade,
  question_id uuid not null references public.double_board_questions (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  submitted_answer integer not null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists double_board_attempts_question_idx
on public.double_board_attempts (question_id, created_at asc);

create index if not exists double_board_attempts_session_player_idx
on public.double_board_attempts (session_id, player_id, created_at desc);

alter table public.double_board_sessions enable row level security;
alter table public.double_board_players enable row level security;
alter table public.double_board_questions enable row level security;
alter table public.double_board_attempts enable row level security;

create policy "double board sessions participant select"
on public.double_board_sessions
for select
to authenticated
using (
  host_teacher_id = auth.uid()
  or (
    course_id is not null
    and (
      exists (
        select 1
        from public.courses
        where courses.id = double_board_sessions.course_id
          and courses.owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.course_members
        where course_members.course_id = double_board_sessions.course_id
          and course_members.profile_id = auth.uid()
          and course_members.role in ('owner', 'editor')
      )
      or exists (
        select 1
        from public.student_course_memberships
        where student_course_memberships.course_id = double_board_sessions.course_id
          and student_course_memberships.profile_id = auth.uid()
      )
    )
  )
);

create policy "double board sessions teacher insert"
on public.double_board_sessions
for insert
to authenticated
with check (
  host_teacher_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.courses
      where courses.id = double_board_sessions.course_id
        and courses.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.course_members
      where course_members.course_id = double_board_sessions.course_id
        and course_members.profile_id = auth.uid()
        and course_members.role in ('owner', 'editor')
    )
  )
);

create policy "double board sessions teacher update"
on public.double_board_sessions
for update
to authenticated
using (
  host_teacher_id = auth.uid()
  or (
    course_id is not null
    and exists (
      select 1
      from public.courses
      where courses.id = double_board_sessions.course_id
        and courses.owner_id = auth.uid()
    )
  )
  or (
    course_id is not null
    and exists (
      select 1
      from public.course_members
      where course_members.course_id = double_board_sessions.course_id
        and course_members.profile_id = auth.uid()
        and course_members.role in ('owner', 'editor')
    )
  )
)
with check (
  host_teacher_id = auth.uid()
  or (
    course_id is not null
    and exists (
      select 1
      from public.courses
      where courses.id = double_board_sessions.course_id
        and courses.owner_id = auth.uid()
    )
  )
  or (
    course_id is not null
    and exists (
      select 1
      from public.course_members
      where course_members.course_id = double_board_sessions.course_id
        and course_members.profile_id = auth.uid()
        and course_members.role in ('owner', 'editor')
    )
  )
);

create policy "double board players participant select"
on public.double_board_players
for select
to authenticated
using (
  exists (
    select 1
    from public.double_board_sessions
    where double_board_sessions.id = double_board_players.session_id
      and (
        double_board_sessions.host_teacher_id = auth.uid()
        or (
          double_board_sessions.course_id is not null
          and (
            exists (
              select 1
              from public.courses
              where courses.id = double_board_sessions.course_id
                and courses.owner_id = auth.uid()
            )
            or exists (
              select 1
              from public.course_members
              where course_members.course_id = double_board_sessions.course_id
                and course_members.profile_id = auth.uid()
                and course_members.role in ('owner', 'editor')
            )
            or exists (
              select 1
              from public.student_course_memberships
              where student_course_memberships.course_id = double_board_sessions.course_id
                and student_course_memberships.profile_id = auth.uid()
            )
          )
        )
      )
  )
);

create policy "double board players self insert"
on public.double_board_players
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.double_board_sessions
    where double_board_sessions.id = double_board_players.session_id
      and (
        double_board_sessions.host_teacher_id = auth.uid()
        or (
          double_board_sessions.course_id is not null
          and (
            exists (
              select 1
              from public.courses
              where courses.id = double_board_sessions.course_id
                and courses.owner_id = auth.uid()
            )
            or exists (
              select 1
              from public.course_members
              where course_members.course_id = double_board_sessions.course_id
                and course_members.profile_id = auth.uid()
                and course_members.role in ('owner', 'editor')
            )
            or exists (
              select 1
              from public.student_course_memberships
              where student_course_memberships.course_id = double_board_sessions.course_id
                and student_course_memberships.profile_id = auth.uid()
            )
          )
        )
      )
  )
);

create policy "double board players self update"
on public.double_board_players
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "double board questions participant select"
on public.double_board_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.double_board_sessions
    where double_board_sessions.id = double_board_questions.session_id
      and (
        double_board_sessions.host_teacher_id = auth.uid()
        or (
          double_board_sessions.course_id is not null
          and (
            exists (
              select 1
              from public.courses
              where courses.id = double_board_sessions.course_id
                and courses.owner_id = auth.uid()
            )
            or exists (
              select 1
              from public.course_members
              where course_members.course_id = double_board_sessions.course_id
                and course_members.profile_id = auth.uid()
                and course_members.role in ('owner', 'editor')
            )
            or exists (
              select 1
              from public.student_course_memberships
              where student_course_memberships.course_id = double_board_sessions.course_id
                and student_course_memberships.profile_id = auth.uid()
            )
          )
        )
      )
  )
);

create policy "double board attempts participant select"
on public.double_board_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.double_board_sessions
    where double_board_sessions.id = double_board_attempts.session_id
      and (
        double_board_sessions.host_teacher_id = auth.uid()
        or (
          double_board_sessions.course_id is not null
          and (
            exists (
              select 1
              from public.courses
              where courses.id = double_board_sessions.course_id
                and courses.owner_id = auth.uid()
            )
            or exists (
              select 1
              from public.course_members
              where course_members.course_id = double_board_sessions.course_id
                and course_members.profile_id = auth.uid()
                and course_members.role in ('owner', 'editor')
            )
            or exists (
              select 1
              from public.student_course_memberships
              where student_course_memberships.course_id = double_board_sessions.course_id
                and student_course_memberships.profile_id = auth.uid()
            )
          )
        )
      )
  )
);

create policy "double board attempts self insert"
on public.double_board_attempts
for insert
to authenticated
with check (
  player_id = auth.uid()
  and exists (
    select 1
    from public.double_board_sessions
    where double_board_sessions.id = double_board_attempts.session_id
      and (
        double_board_sessions.host_teacher_id = auth.uid()
        or (
          double_board_sessions.course_id is not null
          and (
            exists (
              select 1
              from public.courses
              where courses.id = double_board_sessions.course_id
                and courses.owner_id = auth.uid()
            )
            or exists (
              select 1
              from public.course_members
              where course_members.course_id = double_board_sessions.course_id
                and course_members.profile_id = auth.uid()
                and course_members.role in ('owner', 'editor')
            )
            or exists (
              select 1
              from public.student_course_memberships
              where student_course_memberships.course_id = double_board_sessions.course_id
                and student_course_memberships.profile_id = auth.uid()
            )
          )
        )
      )
  )
);
