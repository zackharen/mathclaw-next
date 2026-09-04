create table if not exists public.lesson_resource_site_names (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  hostname text not null check (char_length(hostname) between 1 and 253),
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, hostname)
);

alter table public.lesson_resource_site_names enable row level security;

drop policy if exists "Teachers manage their lesson resource site names"
  on public.lesson_resource_site_names;
create policy "Teachers manage their lesson resource site names"
on public.lesson_resource_site_names
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.lesson_resource_site_names to authenticated;
