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
