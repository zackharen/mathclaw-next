create table if not exists public.projector_word_lists (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projector_word_lists_name_length check (char_length(name) between 1 and 80),
  constraint projector_word_lists_entries_array check (jsonb_typeof(entries) = 'array')
);

alter table public.projector_word_lists enable row level security;

create index if not exists projector_word_lists_teacher_updated_idx
  on public.projector_word_lists (teacher_id, updated_at desc);

drop policy if exists "Teachers can read own projector word lists" on public.projector_word_lists;
create policy "Teachers can read own projector word lists"
  on public.projector_word_lists
  for select
  using (teacher_id = auth.uid());

drop policy if exists "Teachers can insert own projector word lists" on public.projector_word_lists;
create policy "Teachers can insert own projector word lists"
  on public.projector_word_lists
  for insert
  with check (teacher_id = auth.uid());

drop policy if exists "Teachers can update own projector word lists" on public.projector_word_lists;
create policy "Teachers can update own projector word lists"
  on public.projector_word_lists
  for update
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists "Teachers can delete own projector word lists" on public.projector_word_lists;
create policy "Teachers can delete own projector word lists"
  on public.projector_word_lists
  for delete
  using (teacher_id = auth.uid());
