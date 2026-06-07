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

drop policy if exists "teacher absences owner select" on public.teacher_absences;
drop policy if exists "teacher absences owner insert" on public.teacher_absences;
drop policy if exists "teacher absences owner update" on public.teacher_absences;
drop policy if exists "teacher absences owner delete" on public.teacher_absences;

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
