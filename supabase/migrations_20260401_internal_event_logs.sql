create table if not exists public.internal_event_logs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  source text not null,
  level text not null default 'error',
  message text not null,
  user_id uuid null references auth.users(id) on delete set null,
  user_email text null,
  account_type text null,
  course_id uuid null references public.courses(id) on delete set null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
