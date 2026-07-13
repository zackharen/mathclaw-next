create table if not exists public.projector_room_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  day_of_week integer not null,
  start_time time not null,
  end_time time not null,
  room_id uuid not null references public.projector_room_profiles(id) on delete cascade,
  course_id uuid null references public.courses(id) on delete set null,
  label text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projector_room_schedule_day_check check (day_of_week between 0 and 6),
  constraint projector_room_schedule_time_check check (end_time > start_time),
  constraint projector_room_schedule_label_length check (label is null or char_length(label) <= 80)
);

create index if not exists projector_room_schedule_teacher_day_time_idx
  on public.projector_room_schedule_blocks (teacher_id, day_of_week, start_time, end_time);

create index if not exists projector_room_schedule_teacher_room_idx
  on public.projector_room_schedule_blocks (teacher_id, room_id);

create index if not exists projector_room_schedule_teacher_course_idx
  on public.projector_room_schedule_blocks (teacher_id, course_id)
  where course_id is not null;

create or replace function public.set_projector_room_schedule_blocks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projector_room_schedule_blocks_updated_at on public.projector_room_schedule_blocks;
create trigger projector_room_schedule_blocks_updated_at
before update on public.projector_room_schedule_blocks
for each row
execute function public.set_projector_room_schedule_blocks_updated_at();

alter table public.projector_room_schedule_blocks enable row level security;

drop policy if exists "Teachers can manage their projector room schedule" on public.projector_room_schedule_blocks;
create policy "Teachers can manage their projector room schedule"
on public.projector_room_schedule_blocks
for all
to authenticated
using (teacher_id = auth.uid())
with check (
  teacher_id = auth.uid()
  and exists (
    select 1
    from public.projector_room_profiles room
    where room.id = room_id
      and room.teacher_id = auth.uid()
  )
  and (
    course_id is null
    or exists (
      select 1
      from public.courses course
      where course.id = course_id
        and course.owner_id = auth.uid()
    )
  )
);

grant select, insert, update, delete on public.projector_room_schedule_blocks to authenticated;
