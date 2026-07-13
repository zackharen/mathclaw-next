alter table public.projector_room_schedule_blocks
  add column if not exists attachment_type text,
  add column if not exists attachment_id uuid;

alter table public.projector_room_schedule_blocks
  drop constraint if exists projector_room_schedule_blocks_attachment_check;

alter table public.projector_room_schedule_blocks
  add constraint projector_room_schedule_blocks_attachment_check
  check (
    (attachment_type is null and attachment_id is null)
    or (attachment_type in ('scene', 'playlist') and attachment_id is not null)
  );
