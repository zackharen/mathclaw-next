create index if not exists teacher_connections_requester_status_idx
on public.teacher_connections (requester_id, status);
