create table if not exists public.projector_room_profiles (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slots jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projector_room_profiles_name_not_blank check (length(btrim(name)) > 0),
  constraint projector_room_profiles_slots_array check (jsonb_typeof(slots) = 'array'),
  constraint projector_room_profiles_slots_count check (jsonb_array_length(slots) between 1 and 12)
);

create unique index if not exists projector_room_profiles_teacher_name_idx
  on public.projector_room_profiles (teacher_id, lower(name));

create unique index if not exists projector_room_profiles_teacher_default_idx
  on public.projector_room_profiles (teacher_id)
  where is_default;

create unique index if not exists projector_room_profiles_teacher_active_idx
  on public.projector_room_profiles (teacher_id)
  where is_active;

create index if not exists projector_room_profiles_teacher_updated_idx
  on public.projector_room_profiles (teacher_id, updated_at desc);

create or replace function public.set_projector_room_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projector_room_profiles_updated_at on public.projector_room_profiles;
create trigger projector_room_profiles_updated_at
before update on public.projector_room_profiles
for each row
execute function public.set_projector_room_profiles_updated_at();

alter table public.projector_room_profiles enable row level security;

drop policy if exists "Teachers can manage their projector rooms" on public.projector_room_profiles;
create policy "Teachers can manage their projector rooms"
on public.projector_room_profiles
for all
to authenticated
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

grant select, insert, update, delete on public.projector_room_profiles to authenticated;
