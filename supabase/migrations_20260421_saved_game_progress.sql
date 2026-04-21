-- Migrate saved game state out of auth metadata into a proper table.
-- Fixes HTTP 431 caused by large Integer Practice payloads inflating session cookies.

create table if not exists public.saved_game_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_slug text not null,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, game_slug)
);

alter table public.saved_game_progress enable row level security;

create policy "Users can read their own saved game progress"
  on public.saved_game_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert their own saved game progress"
  on public.saved_game_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own saved game progress"
  on public.saved_game_progress for update
  using (auth.uid() = user_id);

create policy "Users can delete their own saved game progress"
  on public.saved_game_progress for delete
  using (auth.uid() = user_id);

create index if not exists saved_game_progress_user_idx
  on public.saved_game_progress (user_id);
