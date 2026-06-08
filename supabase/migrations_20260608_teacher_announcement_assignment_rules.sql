create table if not exists public.teacher_announcement_assignment_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  label text not null,
  cadence text not null check (cadence in ('weekly', 'biweekly', 'monthly', 'marking_period')),
  count_per_period integer not null default 1 check (count_per_period between 1 and 5),
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(label)) > 0)
);

create index if not exists teacher_announcement_assignment_rules_owner_idx
on public.teacher_announcement_assignment_rules (owner_id, is_active, cadence);

alter table public.teacher_announcement_assignment_rules enable row level security;

drop policy if exists "teacher announcement assignment rules owner select" on public.teacher_announcement_assignment_rules;
drop policy if exists "teacher announcement assignment rules owner insert" on public.teacher_announcement_assignment_rules;
drop policy if exists "teacher announcement assignment rules owner update" on public.teacher_announcement_assignment_rules;
drop policy if exists "teacher announcement assignment rules owner delete" on public.teacher_announcement_assignment_rules;

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
