create table if not exists projector_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  pin text not null unique,
  screen_tokens jsonb not null default '{}',
  screen_states jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on projector_sessions(teacher_id);
create index on projector_sessions(pin);

alter table projector_sessions enable row level security;

create policy "Teacher owns their session"
  on projector_sessions for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

create policy "Screen can read session by token"
  on projector_sessions for select
  using (true);
