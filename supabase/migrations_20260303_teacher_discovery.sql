alter table public.profiles
add column if not exists discoverable boolean not null default true;

create index if not exists profiles_discoverable_idx
on public.profiles (discoverable);
