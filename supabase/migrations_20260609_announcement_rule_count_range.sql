alter table public.teacher_announcement_assignment_rules
  drop constraint if exists teacher_announcement_assignment_rules_count_per_period_check;

alter table public.teacher_announcement_assignment_rules
  add constraint teacher_announcement_assignment_rules_count_per_period_check
  check (count_per_period between 1 and 20);
