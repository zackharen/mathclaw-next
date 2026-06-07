create table if not exists public.teacher_marking_periods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name),
  check (start_date <= end_date)
);

create index if not exists teacher_marking_periods_owner_dates_idx
on public.teacher_marking_periods (owner_id, start_date, end_date);

alter table public.teacher_marking_periods enable row level security;

drop policy if exists "teacher marking periods owner select" on public.teacher_marking_periods;
drop policy if exists "teacher marking periods owner insert" on public.teacher_marking_periods;
drop policy if exists "teacher marking periods owner update" on public.teacher_marking_periods;
drop policy if exists "teacher marking periods owner delete" on public.teacher_marking_periods;

create policy "teacher marking periods owner select"
on public.teacher_marking_periods
for select
to authenticated
using (owner_id = auth.uid());

create policy "teacher marking periods owner insert"
on public.teacher_marking_periods
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "teacher marking periods owner update"
on public.teacher_marking_periods
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "teacher marking periods owner delete"
on public.teacher_marking_periods
for delete
to authenticated
using (owner_id = auth.uid());

revoke all on table public.teacher_marking_periods from anon, authenticated;
grant select, insert, update, delete on public.teacher_marking_periods to authenticated;
