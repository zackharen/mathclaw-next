alter table public.teacher_announcement_assignment_rule_overrides
  add column if not exists is_skipped boolean not null default false;
