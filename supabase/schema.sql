-- MathClaw MVP schema
-- Target: Supabase Postgres

create extension if not exists pgcrypto;

-- =========================
-- Profile + collaboration
-- =========================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  nickname text,
  school_name text,
  timezone text not null default 'America/New_York',
  discoverable boolean not null default true,
  account_type text not null default 'teacher' check (account_type in ('teacher', 'student', 'player')),
  school_year_start date,
  school_year_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_discoverable_idx
on public.profiles (discoverable);

create table if not exists public.teacher_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists teacher_connections_addressee_status_idx
on public.teacher_connections (addressee_id, status);

-- =========================
-- Curriculum library (global)
-- =========================
create table if not exists public.curriculum_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_libraries (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.curriculum_providers (id) on delete cascade,
  class_code text not null,
  class_name text not null,
  created_at timestamptz not null default now(),
  unique (provider_id, class_code)
);

create table if not exists public.curriculum_lessons (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.curriculum_libraries (id) on delete cascade,
  sequence_index integer not null,
  source_lesson_code text,
  title text not null,
  objective text,
  created_at timestamptz not null default now(),
  unique (library_id, sequence_index)
);

create table if not exists public.standards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.curriculum_lesson_standards (
  lesson_id uuid not null references public.curriculum_lessons (id) on delete cascade,
  standard_id uuid not null references public.standards (id) on delete cascade,
  primary key (lesson_id, standard_id)
);

create index if not exists curriculum_lesson_standards_standard_idx
on public.curriculum_lesson_standards (standard_id);

-- =========================
-- Course setup
-- =========================
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  class_name text not null,
  grade_band text,
  schedule_model text not null check (schedule_model in ('every_day', 'ab')),
  ab_meeting_day text check (ab_meeting_day in ('A', 'B')),
  ab_pattern_start_date date,
  school_year_start date not null,
  school_year_end date not null,
  timezone text not null default 'America/New_York',
  selected_library_id uuid references public.curriculum_libraries (id),
  student_join_code text unique,
  pacing_mode text not null default 'one_lesson_per_day' check (
    pacing_mode in (
      'one_lesson_per_day',
      'one_lesson_no_half_days',
      'two_lessons_per_day',
      'manual_complete'
    )
  ),
  pacing_weekday_modifiers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (school_year_start < school_year_end)
);

create index if not exists courses_owner_idx on public.courses (owner_id);

create index if not exists courses_student_join_code_idx on public.courses (student_join_code);

create table if not exists public.course_members (
  course_id uuid not null references public.courses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  primary key (course_id, profile_id)
);

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

-- =========================
-- Calendar + pacing
-- =========================
create table if not exists public.day_off_reasons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete cascade,
  label text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, label)
);


create table if not exists public.school_calendar_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  class_date date not null,
  day_type text not null check (day_type in ('off', 'half', 'modified')),
  reason_id uuid references public.day_off_reasons (id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, class_date)
);

create index if not exists school_calendar_days_owner_date_idx
on public.school_calendar_days (owner_id, class_date);

alter table public.school_calendar_days enable row level security;

create policy "school calendar owner select"
on public.school_calendar_days
for select
to authenticated
using (owner_id = auth.uid());

create policy "school calendar owner insert"
on public.school_calendar_days
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "school calendar owner update"
on public.school_calendar_days
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "school calendar owner delete"
on public.school_calendar_days
for delete
to authenticated
using (owner_id = auth.uid());

create table if not exists public.teacher_marking_periods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name),
  check (start_date <= end_date)
);

create index if not exists teacher_marking_periods_owner_dates_idx
on public.teacher_marking_periods (owner_id, start_date, end_date);

alter table public.teacher_marking_periods enable row level security;

create policy "teacher marking periods owner select"
on public.teacher_marking_periods
for select
to authenticated
using (owner_id = auth.uid());

create policy "teacher marking periods owner insert"
on public.teacher_marking_periods
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "teacher marking periods owner update"
on public.teacher_marking_periods
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "teacher marking periods owner delete"
on public.teacher_marking_periods
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.teacher_marking_periods from anon, authenticated;
grant select, insert, update, delete on public.teacher_marking_periods to authenticated;

create table if not exists public.teacher_marking_period_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  start_day_number integer not null check (start_day_number >= 1),
  end_day_number integer not null check (end_day_number >= start_day_number),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index if not exists teacher_marking_period_rules_owner_days_idx
on public.teacher_marking_period_rules (owner_id, start_day_number, end_day_number);

alter table public.teacher_marking_period_rules enable row level security;

create policy "teacher marking period rules owner select"
on public.teacher_marking_period_rules
for select
to authenticated
using (owner_id = auth.uid());

create policy "teacher marking period rules owner insert"
on public.teacher_marking_period_rules
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "teacher marking period rules owner update"
on public.teacher_marking_period_rules
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "teacher marking period rules owner delete"
on public.teacher_marking_period_rules
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.teacher_marking_period_rules from anon, authenticated;
grant select, insert, update, delete on public.teacher_marking_period_rules to authenticated;

create table if not exists public.teacher_absences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  absence_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists teacher_absences_owner_scope_date_idx
on public.teacher_absences (
  owner_id,
  coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
  absence_date
);

create index if not exists teacher_absences_owner_date_idx
on public.teacher_absences (owner_id, absence_date);

alter table public.teacher_absences enable row level security;

create policy "teacher absences owner select"
on public.teacher_absences
for select
to authenticated
using (owner_id = auth.uid());

create policy "teacher absences owner insert"
on public.teacher_absences
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.courses
      where courses.id = teacher_absences.course_id
        and courses.owner_id = auth.uid()
    )
  )
);

create policy "teacher absences owner update"
on public.teacher_absences
for update
to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.courses
      where courses.id = teacher_absences.course_id
        and courses.owner_id = auth.uid()
    )
  )
);

create policy "teacher absences owner delete"
on public.teacher_absences
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.teacher_absences from anon, authenticated;
grant select, insert, update, delete on public.teacher_absences to authenticated;

create table if not exists public.teacher_announcement_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  assignment_date date not null,
  label text not null,
  due_date date,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(label)) > 0)
);

create unique index if not exists teacher_announcement_assignments_owner_scope_date_label_idx
on public.teacher_announcement_assignments (
  owner_id,
  coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
  assignment_date,
  label
);

create index if not exists teacher_announcement_assignments_owner_date_idx
on public.teacher_announcement_assignments (owner_id, assignment_date);

alter table public.teacher_announcement_assignments enable row level security;

create policy "teacher announcement assignments owner select"
on public.teacher_announcement_assignments
for select
to authenticated
using (owner_id = auth.uid());

create policy "teacher announcement assignments owner insert"
on public.teacher_announcement_assignments
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.courses
      where courses.id = teacher_announcement_assignments.course_id
        and courses.owner_id = auth.uid()
    )
  )
);

create policy "teacher announcement assignments owner update"
on public.teacher_announcement_assignments
for update
to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.courses
      where courses.id = teacher_announcement_assignments.course_id
        and courses.owner_id = auth.uid()
    )
  )
);

create policy "teacher announcement assignments owner delete"
on public.teacher_announcement_assignments
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.teacher_announcement_assignments from anon, authenticated;
grant select, insert, update, delete on public.teacher_announcement_assignments to authenticated;

create table if not exists public.teacher_announcement_assignment_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  label text not null,
  cadence text not null check (cadence in ('weekly', 'biweekly', 'monthly', 'marking_period')),
  count_per_period integer not null default 1 check (count_per_period between 1 and 20),
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(label)) > 0)
);

create index if not exists teacher_announcement_assignment_rules_owner_idx
on public.teacher_announcement_assignment_rules (owner_id, is_active, cadence);

alter table public.teacher_announcement_assignment_rules enable row level security;

create policy "teacher announcement assignment rules owner select"
on public.teacher_announcement_assignment_rules
for select
to authenticated
using (owner_id = auth.uid());

create policy "teacher announcement assignment rules owner insert"
on public.teacher_announcement_assignment_rules
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.courses
      where courses.id = teacher_announcement_assignment_rules.course_id
        and courses.owner_id = auth.uid()
    )
  )
);

create policy "teacher announcement assignment rules owner update"
on public.teacher_announcement_assignment_rules
for update
to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.courses
      where courses.id = teacher_announcement_assignment_rules.course_id
        and courses.owner_id = auth.uid()
    )
  )
);

create policy "teacher announcement assignment rules owner delete"
on public.teacher_announcement_assignment_rules
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.teacher_announcement_assignment_rules from anon, authenticated;
grant select, insert, update, delete on public.teacher_announcement_assignment_rules to authenticated;

create table if not exists public.teacher_announcement_assignment_rule_overrides (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  rule_id uuid not null references public.teacher_announcement_assignment_rules (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  original_date date not null,
  assignment_date date not null,
  is_skipped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists teacher_announcement_assignment_rule_overrides_unique_idx
on public.teacher_announcement_assignment_rule_overrides (owner_id, rule_id, course_id, original_date);

create index if not exists teacher_announcement_assignment_rule_overrides_owner_assignment_idx
on public.teacher_announcement_assignment_rule_overrides (owner_id, assignment_date);

alter table public.teacher_announcement_assignment_rule_overrides enable row level security;

create policy "teacher announcement assignment rule overrides owner select"
on public.teacher_announcement_assignment_rule_overrides
for select
to authenticated
using (owner_id = auth.uid());

create policy "teacher announcement assignment rule overrides owner insert"
on public.teacher_announcement_assignment_rule_overrides
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.teacher_announcement_assignment_rules rules
    where rules.id = teacher_announcement_assignment_rule_overrides.rule_id
      and rules.owner_id = auth.uid()
      and (rules.course_id is null or rules.course_id = teacher_announcement_assignment_rule_overrides.course_id)
  )
  and exists (
    select 1
    from public.courses
    where courses.id = teacher_announcement_assignment_rule_overrides.course_id
      and courses.owner_id = auth.uid()
  )
);

create policy "teacher announcement assignment rule overrides owner update"
on public.teacher_announcement_assignment_rule_overrides
for update
to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.teacher_announcement_assignment_rules rules
    where rules.id = teacher_announcement_assignment_rule_overrides.rule_id
      and rules.owner_id = auth.uid()
      and (rules.course_id is null or rules.course_id = teacher_announcement_assignment_rule_overrides.course_id)
  )
  and exists (
    select 1
    from public.courses
    where courses.id = teacher_announcement_assignment_rule_overrides.course_id
      and courses.owner_id = auth.uid()
  )
);

create policy "teacher announcement assignment rule overrides owner delete"
on public.teacher_announcement_assignment_rule_overrides
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.teacher_announcement_assignment_rule_overrides from anon, authenticated;
grant select, insert, update, delete on public.teacher_announcement_assignment_rule_overrides to authenticated;

create table if not exists public.course_calendar_days (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  class_date date not null,
  day_type text not null check (day_type in ('instructional', 'off', 'half', 'modified')),
  ab_day text check (ab_day in ('A', 'B')),
  reason_id uuid references public.day_off_reasons (id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, class_date)
);

create index if not exists course_calendar_days_course_date_idx
on public.course_calendar_days (course_id, class_date);

create table if not exists public.course_lesson_plan (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  class_date date not null,
  lesson_slot integer not null default 1 check (lesson_slot >= 1),
  lesson_id uuid references public.curriculum_lessons (id),
  status text not null default 'planned' check (status in ('planned','completed','deferred','skipped')),
  is_added_buffer_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, class_date, lesson_slot)
);

create index if not exists course_lesson_plan_course_status_idx
on public.course_lesson_plan (course_id, status);

-- =========================
-- Announcements
-- =========================
create table if not exists public.announcement_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  body_template text not null,
  include_do_now boolean not null default false,
  include_quote boolean not null default false,
  include_day_number boolean not null default false,
  include_day_of_week boolean not null default false,
  include_regular_assignments boolean not null default false,
  regular_assignments text,
  is_default boolean not null default false,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.course_announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  class_date date not null,
  content text not null,
  copied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, class_date)
);

-- =========================
-- Student games
-- =========================
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

create policy "global stats self write"
on public.game_player_global_stats
for all
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

create policy "course stats self write"
on public.course_game_player_stats
for all
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

-- =========================
-- Activities by standard
-- =========================
create table if not exists public.activity_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.activity_providers (id) on delete cascade,
  title text not null,
  url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_standards (
  activity_id uuid not null references public.activities (id) on delete cascade,
  standard_id uuid not null references public.standards (id) on delete cascade,
  primary key (activity_id, standard_id)
);

-- =========================
-- Baseline seed rows
-- =========================
insert into public.curriculum_providers (code, name)
values
  ('illustrative_math', 'Illustrative Mathematics'),
  ('math_medic', 'Math Medic')
on conflict (code) do nothing;

insert into public.activity_providers (code, name)
values
  ('delta_math', 'Delta Math'),
  ('ixl', 'IXL'),
  ('khan_academy', 'Khan Academy')
on conflict (code) do nothing;

insert into public.day_off_reasons (owner_id, label, is_system)
values
  (null, 'Snow Day', true),
  (null, 'Teacher Out', true),
  (null, 'High Student Absence', true),
  (null, 'School Activity', true)
on conflict (owner_id, label) do nothing;

insert into public.games (slug, name, category, description, is_multiplayer)
values
  ('2048', '2048', 'arcade', 'Merge tiles and chase higher scores.', false),
  ('connect4', 'Connect4', 'multiplayer', 'Play head-to-head with an invite code.', true),
  ('integer_practice', 'Adding & Subtracting Integers', 'math_skills', 'Adaptive integer fluency practice.', false),
  ('money_counting', 'Money Counting', 'math_skills', 'Count money or build the right amount with quick replayable rounds.', false),
  ('minesweeper', 'Minesweeper', 'arcade', 'Clear the board, flag the mines, and beat the clock.', false),
  ('number_compare', 'Which Number Is Bigger?', 'math_skills', 'Compare decimals, negatives, fractions, and more.', false)
  ,
  ('telling_time', 'Telling Time', 'math_skills', 'Read clocks and set times with fast clock-based rounds.', false)
on conflict (slug) do nothing;
