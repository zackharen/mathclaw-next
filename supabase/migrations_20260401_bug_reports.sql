create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid null references auth.users(id) on delete set null,
  reporter_email text not null,
  reporter_name text null,
  account_type text null,
  page_path text null,
  severity text not null default 'normal',
  summary text not null,
  details text not null,
  expected_behavior text null,
  status text not null default 'open',
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
