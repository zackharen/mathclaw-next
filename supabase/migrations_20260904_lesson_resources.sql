create table if not exists public.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
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

create index if not exists lesson_resources_owner_created_idx
  on public.lesson_resources(owner_id, created_at desc);

create table if not exists public.lesson_resource_lessons (
  resource_id uuid not null references public.lesson_resources(id) on delete cascade,
  lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_id, lesson_id)
);

create index if not exists lesson_resource_lessons_lesson_idx
  on public.lesson_resource_lessons(lesson_id, resource_id);

create table if not exists public.lesson_resource_shares (
  resource_id uuid not null references public.lesson_resources(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_id, teacher_id)
);

create index if not exists lesson_resource_shares_teacher_idx
  on public.lesson_resource_shares(teacher_id, resource_id);

create table if not exists public.teacher_resource_library_shares (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, teacher_id),
  check (owner_id <> teacher_id)
);

create index if not exists teacher_resource_library_shares_teacher_idx
  on public.teacher_resource_library_shares(teacher_id, owner_id);

alter table public.lesson_resources enable row level security;
alter table public.lesson_resource_lessons enable row level security;
alter table public.lesson_resource_shares enable row level security;
alter table public.teacher_resource_library_shares enable row level security;

drop policy if exists "Lesson resource owners manage resources" on public.lesson_resources;
create policy "Lesson resource owners manage resources"
on public.lesson_resources
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Lesson resource owners manage lesson links" on public.lesson_resource_lessons;
create policy "Lesson resource owners manage lesson links"
on public.lesson_resource_lessons
for all
to authenticated
using (
  exists (
    select 1
    from public.lesson_resources resource
    where resource.id = lesson_resource_lessons.resource_id
      and resource.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.lesson_resources resource
    where resource.id = lesson_resource_lessons.resource_id
      and resource.owner_id = (select auth.uid())
  )
);

drop policy if exists "Lesson resource owners manage direct shares" on public.lesson_resource_shares;
create policy "Lesson resource owners manage direct shares"
on public.lesson_resource_shares
for all
to authenticated
using (
  exists (
    select 1
    from public.lesson_resources resource
    where resource.id = lesson_resource_shares.resource_id
      and resource.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.lesson_resources resource
    where resource.id = lesson_resource_shares.resource_id
      and resource.owner_id = (select auth.uid())
  )
);

drop policy if exists "Shared teachers can read direct share grants" on public.lesson_resource_shares;
create policy "Shared teachers can read direct share grants"
on public.lesson_resource_shares
for select
to authenticated
using ((select auth.uid()) = teacher_id);

drop policy if exists "Owners manage resource library shares" on public.teacher_resource_library_shares;
create policy "Owners manage resource library shares"
on public.teacher_resource_library_shares
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Shared teachers can read library share grants" on public.teacher_resource_library_shares;
create policy "Shared teachers can read library share grants"
on public.teacher_resource_library_shares
for select
to authenticated
using ((select auth.uid()) = teacher_id);

grant select, insert, update, delete on public.lesson_resources to authenticated;
grant select, insert, update, delete on public.lesson_resource_lessons to authenticated;
grant select, insert, update, delete on public.lesson_resource_shares to authenticated;
grant select, insert, update, delete on public.teacher_resource_library_shares to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-resources',
  'lesson-resources',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.presentation',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Teachers upload their lesson resources" on storage.objects;
create policy "Teachers upload their lesson resources"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'lesson-resources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Teachers read their lesson resource files" on storage.objects;
create policy "Teachers read their lesson resource files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lesson-resources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Teachers update their lesson resource files" on storage.objects;
create policy "Teachers update their lesson resource files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'lesson-resources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'lesson-resources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Teachers delete their lesson resource files" on storage.objects;
create policy "Teachers delete their lesson resource files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'lesson-resources'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
