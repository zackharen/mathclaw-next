alter table public.courses
add column if not exists ab_meeting_day text check (ab_meeting_day in ('A', 'B'));
