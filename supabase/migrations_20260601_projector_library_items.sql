create table if not exists projector_library_items (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content_type text not null check (content_type in ('text', 'latex', 'image', 'video')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projector_library_items_teacher_updated_idx
  on projector_library_items(teacher_id, updated_at desc);

alter table projector_library_items enable row level security;

create policy "Teacher owns their projector library"
  on projector_library_items for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);
