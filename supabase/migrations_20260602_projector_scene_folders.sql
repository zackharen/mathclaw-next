create table if not exists projector_scene_folders (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projector_scene_folders_teacher_updated_idx
  on projector_scene_folders(teacher_id, updated_at desc);

create unique index if not exists projector_scene_folders_id_teacher_idx
  on projector_scene_folders(id, teacher_id);

alter table projector_scene_folders enable row level security;

grant select, insert, update, delete on projector_scene_folders to authenticated;

create policy "Teacher owns their projector scene folders"
  on projector_scene_folders for all
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

alter table projector_scene_library_items
  add column if not exists folder_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projector_scene_library_items_folder_teacher_fk'
  ) then
    alter table projector_scene_library_items
      add constraint projector_scene_library_items_folder_teacher_fk
      foreign key (folder_id, teacher_id)
      references projector_scene_folders(id, teacher_id);
  end if;
end $$;

create index if not exists projector_scene_library_items_teacher_folder_updated_idx
  on projector_scene_library_items(teacher_id, folder_id, updated_at desc);
