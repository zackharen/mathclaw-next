create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, profile_id)
);

create table if not exists public.open_middle_templates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  school_id uuid references public.schools (id) on delete set null,
  title text not null,
  raw_input text not null,
  parsed_structure jsonb not null default '{}'::jsonb,
  digit_pool integer[] not null default array[0,1,2,3,4,5,6,7,8,9],
  rules jsonb not null default '{}'::jsonb,
  standard_code text,
  visibility text not null default 'private' check (visibility in ('private', 'class', 'school', 'public')),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists open_middle_templates_created_by_idx
on public.open_middle_templates (created_by, updated_at desc);

create index if not exists open_middle_templates_visibility_idx
on public.open_middle_templates (visibility, approved, updated_at desc);

create index if not exists open_middle_templates_school_idx
on public.open_middle_templates (school_id, visibility, approved);

create table if not exists public.open_middle_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.open_middle_templates (id) on delete cascade,
  title text not null,
  raw_input text not null,
  parsed_structure jsonb not null default '{}'::jsonb,
  operator_signature text not null,
  is_base boolean not null default false,
  created_at timestamptz not null default now(),
  unique (template_id, operator_signature)
);

create index if not exists open_middle_template_versions_template_idx
on public.open_middle_template_versions (template_id, is_base desc, created_at asc);

create table if not exists public.open_middle_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses (id) on delete set null,
  host_teacher_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid not null references public.open_middle_templates (id) on delete cascade,
  template_version_id uuid not null references public.open_middle_template_versions (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'live', 'reveal', 'ended')),
  timer_seconds integer not null default 120,
  reveal_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists open_middle_sessions_course_status_idx
on public.open_middle_sessions (course_id, status, updated_at desc);

create index if not exists open_middle_sessions_host_idx
on public.open_middle_sessions (host_teacher_id, updated_at desc);

create table if not exists public.open_middle_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.open_middle_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  role text not null default 'student' check (role in ('teacher', 'student')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists open_middle_players_session_idx
on public.open_middle_players (session_id, joined_at asc);

create table if not exists public.open_middle_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.open_middle_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_version_id uuid not null references public.open_middle_template_versions (id) on delete cascade,
  response_values jsonb not null default '{}'::jsonb,
  validation_result jsonb not null default '{}'::jsonb,
  is_complete boolean not null default false,
  is_correct boolean not null default false,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists open_middle_responses_session_idx
on public.open_middle_responses (session_id, is_correct, updated_at desc);

alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.open_middle_templates enable row level security;
alter table public.open_middle_template_versions enable row level security;
alter table public.open_middle_sessions enable row level security;
alter table public.open_middle_players enable row level security;
alter table public.open_middle_responses enable row level security;

create policy "schools members select"
on public.schools
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.school_memberships
    where school_memberships.school_id = schools.id
      and school_memberships.profile_id = auth.uid()
  )
);

create policy "schools creator insert"
on public.schools
for insert
to authenticated
with check (created_by = auth.uid());

create policy "schools owner update"
on public.schools
for update
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.school_memberships
    where school_memberships.school_id = schools.id
      and school_memberships.profile_id = auth.uid()
      and school_memberships.role = 'owner'
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1
    from public.school_memberships
    where school_memberships.school_id = schools.id
      and school_memberships.profile_id = auth.uid()
      and school_memberships.role = 'owner'
  )
);

create policy "school memberships members select"
on public.school_memberships
for select
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.school_memberships as viewer_memberships
    where viewer_memberships.school_id = school_memberships.school_id
      and viewer_memberships.profile_id = auth.uid()
  )
);

create policy "school memberships self insert"
on public.school_memberships
for insert
to authenticated
with check (profile_id = auth.uid());

create policy "school memberships owner update"
on public.school_memberships
for update
to authenticated
using (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.school_memberships as viewer_memberships
    where viewer_memberships.school_id = school_memberships.school_id
      and viewer_memberships.profile_id = auth.uid()
      and viewer_memberships.role = 'owner'
  )
)
with check (
  profile_id = auth.uid()
  or exists (
    select 1
    from public.school_memberships as viewer_memberships
    where viewer_memberships.school_id = school_memberships.school_id
      and viewer_memberships.profile_id = auth.uid()
      and viewer_memberships.role = 'owner'
  )
);

create policy "open middle templates visible select"
on public.open_middle_templates
for select
to authenticated
using (
  created_by = auth.uid()
  or (
    approved = true
    and (
      visibility = 'public'
      or (
        visibility = 'school'
        and school_id is not null
        and exists (
          select 1
          from public.school_memberships
          where school_memberships.school_id = open_middle_templates.school_id
            and school_memberships.profile_id = auth.uid()
        )
      )
      or (
        visibility = 'class'
        and (rules ->> 'courseId') is not null
        and (
          exists (
            select 1
            from public.courses
            where courses.id::text = open_middle_templates.rules ->> 'courseId'
              and courses.owner_id = auth.uid()
          )
          or exists (
            select 1
            from public.course_members
            where course_members.course_id::text = open_middle_templates.rules ->> 'courseId'
              and course_members.profile_id = auth.uid()
              and course_members.role in ('owner', 'editor')
          )
          or exists (
            select 1
            from public.student_course_memberships
            where student_course_memberships.course_id::text = open_middle_templates.rules ->> 'courseId'
              and student_course_memberships.profile_id = auth.uid()
          )
        )
      )
    )
  )
);

create policy "open middle templates creator insert"
on public.open_middle_templates
for insert
to authenticated
with check (created_by = auth.uid());

create policy "open middle templates creator update"
on public.open_middle_templates
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "open middle template versions visible select"
on public.open_middle_template_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.open_middle_templates
    where open_middle_templates.id = open_middle_template_versions.template_id
  )
);

create policy "open middle template versions creator insert"
on public.open_middle_template_versions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.open_middle_templates
    where open_middle_templates.id = open_middle_template_versions.template_id
      and open_middle_templates.created_by = auth.uid()
  )
);

create policy "open middle sessions participant select"
on public.open_middle_sessions
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
        where courses.id = open_middle_sessions.course_id
          and courses.owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.course_members
        where course_members.course_id = open_middle_sessions.course_id
          and course_members.profile_id = auth.uid()
          and course_members.role in ('owner', 'editor')
      )
      or exists (
        select 1
        from public.student_course_memberships
        where student_course_memberships.course_id = open_middle_sessions.course_id
          and student_course_memberships.profile_id = auth.uid()
      )
    )
  )
);

create policy "open middle sessions teacher insert"
on public.open_middle_sessions
for insert
to authenticated
with check (
  host_teacher_id = auth.uid()
  and (
    course_id is null
    or exists (
      select 1
      from public.courses
      where courses.id = open_middle_sessions.course_id
        and courses.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.course_members
      where course_members.course_id = open_middle_sessions.course_id
        and course_members.profile_id = auth.uid()
        and course_members.role in ('owner', 'editor')
    )
  )
);

create policy "open middle sessions teacher update"
on public.open_middle_sessions
for update
to authenticated
using (
  host_teacher_id = auth.uid()
  or (
    course_id is not null
    and exists (
      select 1
      from public.courses
      where courses.id = open_middle_sessions.course_id
        and courses.owner_id = auth.uid()
    )
  )
  or (
    course_id is not null
    and exists (
      select 1
      from public.course_members
      where course_members.course_id = open_middle_sessions.course_id
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
      where courses.id = open_middle_sessions.course_id
        and courses.owner_id = auth.uid()
    )
  )
  or (
    course_id is not null
    and exists (
      select 1
      from public.course_members
      where course_members.course_id = open_middle_sessions.course_id
        and course_members.profile_id = auth.uid()
        and course_members.role in ('owner', 'editor')
    )
  )
);

create policy "open middle players participant select"
on public.open_middle_players
for select
to authenticated
using (
  exists (
    select 1
    from public.open_middle_sessions
    where open_middle_sessions.id = open_middle_players.session_id
  )
);

create policy "open middle players self insert"
on public.open_middle_players
for insert
to authenticated
with check (user_id = auth.uid());

create policy "open middle players self update"
on public.open_middle_players
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "open middle responses participant select"
on public.open_middle_responses
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.open_middle_sessions
    where open_middle_sessions.id = open_middle_responses.session_id
      and (
        open_middle_sessions.host_teacher_id = auth.uid()
        or (
          open_middle_sessions.course_id is not null
          and (
            exists (
              select 1
              from public.courses
              where courses.id = open_middle_sessions.course_id
                and courses.owner_id = auth.uid()
            )
            or exists (
              select 1
              from public.course_members
              where course_members.course_id = open_middle_sessions.course_id
                and course_members.profile_id = auth.uid()
                and course_members.role in ('owner', 'editor')
            )
          )
        )
      )
  )
);

create policy "open middle responses self insert"
on public.open_middle_responses
for insert
to authenticated
with check (user_id = auth.uid());

create policy "open middle responses self update"
on public.open_middle_responses
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.open_middle_sessions
    where open_middle_sessions.id = open_middle_responses.session_id
      and open_middle_sessions.host_teacher_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.open_middle_sessions
    where open_middle_sessions.id = open_middle_responses.session_id
      and open_middle_sessions.host_teacher_id = auth.uid()
  )
);
