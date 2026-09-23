create table if not exists public.teacher_bell_schedule_types (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.teacher_bell_schedule_types enable row level security;

create policy "teacher bell schedule types owner select"
on public.teacher_bell_schedule_types
for select
to authenticated
using (owner_id = auth.uid());

create policy "teacher bell schedule types owner insert"
on public.teacher_bell_schedule_types
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "teacher bell schedule types owner update"
on public.teacher_bell_schedule_types
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "teacher bell schedule types owner delete"
on public.teacher_bell_schedule_types
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.teacher_bell_schedule_types from anon, authenticated;
grant select, insert, update, delete on public.teacher_bell_schedule_types to authenticated;

create or replace function public.set_teacher_bell_schedule_types_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teacher_bell_schedule_types_updated_at on public.teacher_bell_schedule_types;
create trigger teacher_bell_schedule_types_updated_at
before update on public.teacher_bell_schedule_types
for each row
execute function public.set_teacher_bell_schedule_types_updated_at();

create table if not exists public.teacher_bell_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  schedule_type_id uuid not null references public.teacher_bell_schedule_types (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  start_time time not null,
  end_time time not null,
  label text check (label is null or char_length(label) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_bell_schedule_blocks_time_check check (end_time > start_time),
  unique (schedule_type_id, course_id)
);

create index if not exists teacher_bell_schedule_blocks_owner_type_idx
on public.teacher_bell_schedule_blocks (owner_id, schedule_type_id, start_time, end_time);

alter table public.teacher_bell_schedule_blocks enable row level security;

create policy "teacher bell schedule blocks owner select"
on public.teacher_bell_schedule_blocks
for select
to authenticated
using (owner_id = auth.uid());

create policy "teacher bell schedule blocks owner insert"
on public.teacher_bell_schedule_blocks
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.teacher_bell_schedule_types t
    where t.id = schedule_type_id and t.owner_id = auth.uid()
  )
  and exists (
    select 1 from public.courses c
    where c.id = course_id and c.owner_id = auth.uid()
  )
);

create policy "teacher bell schedule blocks owner update"
on public.teacher_bell_schedule_blocks
for update
to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.teacher_bell_schedule_types t
    where t.id = schedule_type_id and t.owner_id = auth.uid()
  )
  and exists (
    select 1 from public.courses c
    where c.id = course_id and c.owner_id = auth.uid()
  )
);

create policy "teacher bell schedule blocks owner delete"
on public.teacher_bell_schedule_blocks
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.teacher_bell_schedule_blocks from anon, authenticated;
grant select, insert, update, delete on public.teacher_bell_schedule_blocks to authenticated;

create or replace function public.set_teacher_bell_schedule_blocks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teacher_bell_schedule_blocks_updated_at on public.teacher_bell_schedule_blocks;
create trigger teacher_bell_schedule_blocks_updated_at
before update on public.teacher_bell_schedule_blocks
for each row
execute function public.set_teacher_bell_schedule_blocks_updated_at();

alter table public.school_calendar_days
  add column if not exists bell_schedule_type_id uuid
    references public.teacher_bell_schedule_types (id) on delete set null;
