alter table public.announcement_templates
add column if not exists include_do_now boolean not null default false,
add column if not exists include_quote boolean not null default false;
