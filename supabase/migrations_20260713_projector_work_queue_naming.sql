alter table public.projector_work_queue
  add column if not exists student_name text,
  add column if not exists label text;
