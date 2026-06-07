create table if not exists public.teacher_marking_period_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  start_day_number integer not null check (start_day_number >= 1),
  end_day_number integer not null check (end_day_number >= start_day_number),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create index if not exists teacher_marking_period_rules_owner_days_idx
on public.teacher_marking_period_rules (owner_id, start_day_number, end_day_number);

alter table public.teacher_marking_period_rules enable row level security;

drop policy if exists "teacher marking period rules owner select" on public.teacher_marking_period_rules;
drop policy if exists "teacher marking period rules owner insert" on public.teacher_marking_period_rules;
drop policy if exists "teacher marking period rules owner update" on public.teacher_marking_period_rules;
drop policy if exists "teacher marking period rules owner delete" on public.teacher_marking_period_rules;

create policy "teacher marking period rules owner select"
on public.teacher_marking_period_rules
for select
to authenticated
using (owner_id = auth.uid());

create policy "teacher marking period rules owner insert"
on public.teacher_marking_period_rules
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "teacher marking period rules owner update"
on public.teacher_marking_period_rules
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "teacher marking period rules owner delete"
on public.teacher_marking_period_rules
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.teacher_marking_period_rules from anon, authenticated;
grant select, insert, update, delete on public.teacher_marking_period_rules to authenticated;
