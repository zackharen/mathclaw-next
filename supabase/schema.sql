-- MathClaw MVP schema
-- Target: Supabase Postgres

create extension if not exists pgcrypto;

-- =========================
-- Profile + collaboration
-- =========================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  school_name text,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  ab_pattern_start_date date,
  school_year_start date not null,
  school_year_end date not null,
  timezone text not null default 'America/New_York',
  selected_library_id uuid references public.curriculum_libraries (id),
  pacing_mode text not null default 'one_lesson_per_day' check (pacing_mode in ('one_lesson_per_day', 'manual_complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (school_year_start < school_year_end)
);

create index if not exists courses_owner_idx on public.courses (owner_id);

create table if not exists public.course_members (
  course_id uuid not null references public.courses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  primary key (course_id, profile_id)
);

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
  lesson_id uuid references public.curriculum_lessons (id),
  status text not null default 'planned' check (status in ('planned','completed','deferred','skipped')),
  is_added_buffer_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, class_date)
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
