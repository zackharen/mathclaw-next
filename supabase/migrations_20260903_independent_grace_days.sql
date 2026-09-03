alter table if exists public.school_calendar_days
add column if not exists is_grace_day boolean not null default false;

alter table if exists public.course_calendar_days
add column if not exists is_grace_day boolean not null default false;

update public.school_calendar_days
set is_grace_day = true,
    day_type = 'instructional',
    updated_at = now()
where day_type = 'grace_day';

update public.course_calendar_days
set is_grace_day = true,
    day_type = 'instructional',
    updated_at = now()
where day_type = 'grace_day';

alter table public.school_calendar_days
drop constraint if exists school_calendar_days_day_type_check;

alter table public.school_calendar_days
add constraint school_calendar_days_day_type_check
check (day_type in ('instructional', 'off', 'half', 'modified'));

alter table public.course_calendar_days
drop constraint if exists course_calendar_days_day_type_check;

alter table public.course_calendar_days
add constraint course_calendar_days_day_type_check
check (day_type in ('instructional', 'off', 'half', 'modified'));
