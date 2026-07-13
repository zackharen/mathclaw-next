alter table public.projector_work_queue
  add column if not exists reviewed_at timestamptz,
  add column if not exists flagged_at timestamptz;
