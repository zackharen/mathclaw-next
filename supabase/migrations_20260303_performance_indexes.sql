-- Performance indexes for frequently queried paths
-- Run in Supabase SQL editor (safe: IF NOT EXISTS)

create index if not exists course_announcements_course_date_idx
on public.course_announcements (course_id, class_date);

create index if not exists day_off_reasons_owner_label_idx
on public.day_off_reasons (owner_id, label);

create index if not exists course_members_profile_idx
on public.course_members (profile_id);

create index if not exists course_lesson_plan_course_date_idx
on public.course_lesson_plan (course_id, class_date);

create index if not exists course_calendar_days_course_daytype_date_idx
on public.course_calendar_days (course_id, day_type, class_date);
