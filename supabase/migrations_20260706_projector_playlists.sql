create table if not exists public.projector_playlists (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  loop boolean not null default true,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projector_playlists_name_not_blank check (length(btrim(name)) > 0),
  constraint projector_playlists_entries_array check (jsonb_typeof(entries) = 'array')
);

create unique index if not exists projector_playlists_teacher_name_idx
  on public.projector_playlists (teacher_id, lower(name));

create index if not exists projector_playlists_teacher_updated_idx
  on public.projector_playlists (teacher_id, updated_at desc);

create or replace function public.set_projector_playlists_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projector_playlists_updated_at on public.projector_playlists;
create trigger projector_playlists_updated_at
before update on public.projector_playlists
for each row
execute function public.set_projector_playlists_updated_at();

alter table public.projector_playlists enable row level security;

drop policy if exists "Teachers can manage their projector playlists" on public.projector_playlists;
create policy "Teachers can manage their projector playlists"
on public.projector_playlists
for all
to authenticated
using ((select auth.uid()) = teacher_id)
with check ((select auth.uid()) = teacher_id);

grant select, insert, update, delete on public.projector_playlists to authenticated;
