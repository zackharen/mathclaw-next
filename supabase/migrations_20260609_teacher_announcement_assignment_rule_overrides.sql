create table if not exists public.teacher_announcement_assignment_rule_overrides (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  rule_id uuid not null references public.teacher_announcement_assignment_rules (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  original_date date not null,
  assignment_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists teacher_announcement_assignment_rule_overrides_unique_idx
on public.teacher_announcement_assignment_rule_overrides (owner_id, rule_id, course_id, original_date);

create index if not exists teacher_announcement_assignment_rule_overrides_owner_assignment_idx
on public.teacher_announcement_assignment_rule_overrides (owner_id, assignment_date);

alter table public.teacher_announcement_assignment_rule_overrides enable row level security;

drop policy if exists "teacher announcement assignment rule overrides owner select" on public.teacher_announcement_assignment_rule_overrides;
drop policy if exists "teacher announcement assignment rule overrides owner insert" on public.teacher_announcement_assignment_rule_overrides;
drop policy if exists "teacher announcement assignment rule overrides owner update" on public.teacher_announcement_assignment_rule_overrides;
drop policy if exists "teacher announcement assignment rule overrides owner delete" on public.teacher_announcement_assignment_rule_overrides;

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
