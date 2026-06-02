create table if not exists projector_scene_library_items (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  screen_states jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projector_scene_library_items_teacher_updated_idx
  on projector_scene_library_items(teacher_id, updated_at desc);

alter table projector_scene_library_items enable row level security;

grant select, insert, update, delete on projector_scene_library_items to authenticated;

create policy "Teacher owns their projector scenes"
  on projector_scene_library_items for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);
