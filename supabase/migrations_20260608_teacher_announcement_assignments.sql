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

drop policy if exists "teacher announcement assignments owner select" on public.teacher_announcement_assignments;
drop policy if exists "teacher announcement assignments owner insert" on public.teacher_announcement_assignments;
drop policy if exists "teacher announcement assignments owner update" on public.teacher_announcement_assignments;
drop policy if exists "teacher announcement assignments owner delete" on public.teacher_announcement_assignments;

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
