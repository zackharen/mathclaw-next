-- Profile-level school calendar support (apply to all classes)

alter table public.profiles
  add column if not exists school_year_start date,
  add column if not exists school_year_end date;

create table if not exists public.school_calendar_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  class_date date not null,
  day_type text not null check (day_type in ('off', 'half', 'modified')),
  reason_id uuid references public.day_off_reasons (id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, class_date)
);

create index if not exists school_calendar_days_owner_date_idx
on public.school_calendar_days (owner_id, class_date);
