create table if not exists public.projector_work_queue (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.projector_sessions(id) on delete cascade,
  screen_number integer not null check (screen_number between 1 and 12),
  screen_name text not null,
  storage_bucket text not null default 'projector-work-queue',
  storage_path text not null,
  public_url text not null,
  content_type text not null default 'image/jpeg',
  size_bytes integer not null default 0 check (size_bytes >= 0),
  status text not null default 'queued' check (status in ('queued', 'sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists projector_work_queue_teacher_created_idx
  on public.projector_work_queue (teacher_id, created_at desc);

create index if not exists projector_work_queue_session_created_idx
  on public.projector_work_queue (session_id, created_at desc);

alter table public.projector_work_queue enable row level security;

drop policy if exists "Teachers can manage their projector work queue" on public.projector_work_queue;
create policy "Teachers can manage their projector work queue"
on public.projector_work_queue
for all
to authenticated
using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

grant select, insert, update, delete on public.projector_work_queue to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'projector-work-queue',
  'projector-work-queue',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
