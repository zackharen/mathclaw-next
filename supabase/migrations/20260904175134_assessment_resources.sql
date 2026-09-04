create table if not exists public.assessment_resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  rule_id uuid references public.teacher_announcement_assignment_rules(id) on delete set null,
  original_date date not null,
  assignment_date date not null,
  assignment_label text not null check (char_length(trim(assignment_label)) between 1 and 160),
  assessment_number text not null check (assessment_number ~ '^[1-9][0-9]*\.[1-9][0-9]*$'),
  resource_type text not null check (resource_type in ('link', 'file')),
  title text not null check (char_length(title) between 1 and 160),
  url text,
  storage_bucket text,
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or (size_bytes > 0 and size_bytes <= 26214400)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (resource_type = 'link' and url is not null and storage_path is null)
    or
    (resource_type = 'file' and url is null and storage_bucket is not null and storage_path is not null)
  )
);

create index if not exists assessment_resources_course_occurrence_idx
  on public.assessment_resources(course_id, rule_id, original_date, created_at);

create index if not exists assessment_resources_owner_created_idx
  on public.assessment_resources(owner_id, created_at desc);

create table if not exists public.assessment_resource_lessons (
  resource_id uuid not null references public.assessment_resources(id) on delete cascade,
  lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_id, lesson_id)
);

create index if not exists assessment_resource_lessons_lesson_idx
  on public.assessment_resource_lessons(lesson_id, resource_id);

alter table public.assessment_resources enable row level security;
alter table public.assessment_resource_lessons enable row level security;

drop policy if exists "Course teachers read assessment resources" on public.assessment_resources;
create policy "Course teachers read assessment resources"
on public.assessment_resources
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.courses
    where courses.id = assessment_resources.course_id
      and courses.owner_id = (select auth.uid())
  )
  or exists (
    select 1 from public.course_members
    where course_members.course_id = assessment_resources.course_id
      and course_members.profile_id = (select auth.uid())
      and course_members.role in ('owner', 'editor')
  )
);

drop policy if exists "Course teachers create assessment resources" on public.assessment_resources;
create policy "Course teachers create assessment resources"
on public.assessment_resources
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and (
    exists (
      select 1 from public.courses
      where courses.id = assessment_resources.course_id
        and courses.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.course_members
      where course_members.course_id = assessment_resources.course_id
        and course_members.profile_id = (select auth.uid())
        and course_members.role in ('owner', 'editor')
    )
  )
);

drop policy if exists "Assessment resource owners update" on public.assessment_resources;
create policy "Assessment resource owners update"
on public.assessment_resources
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "Assessment resource owners delete" on public.assessment_resources;
create policy "Assessment resource owners delete"
on public.assessment_resources
for delete
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "Course teachers read assessment lesson links" on public.assessment_resource_lessons;
create policy "Course teachers read assessment lesson links"
on public.assessment_resource_lessons
for select
to authenticated
using (
  exists (
    select 1 from public.assessment_resources resource
    where resource.id = assessment_resource_lessons.resource_id
      and (
        resource.owner_id = (select auth.uid())
        or exists (
          select 1 from public.courses
          where courses.id = resource.course_id
            and courses.owner_id = (select auth.uid())
        )
        or exists (
          select 1 from public.course_members
          where course_members.course_id = resource.course_id
            and course_members.profile_id = (select auth.uid())
            and course_members.role in ('owner', 'editor')
        )
      )
  )
);

drop policy if exists "Assessment resource owners manage lesson links" on public.assessment_resource_lessons;
create policy "Assessment resource owners manage lesson links"
on public.assessment_resource_lessons
for all
to authenticated
using (
  exists (
    select 1 from public.assessment_resources resource
    where resource.id = assessment_resource_lessons.resource_id
      and resource.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.assessment_resources resource
    where resource.id = assessment_resource_lessons.resource_id
      and resource.owner_id = (select auth.uid())
  )
);

revoke all on table public.assessment_resources from anon, authenticated;
revoke all on table public.assessment_resource_lessons from anon, authenticated;
grant select, insert, update, delete on public.assessment_resources to authenticated;
grant select, insert, update, delete on public.assessment_resource_lessons to authenticated;
