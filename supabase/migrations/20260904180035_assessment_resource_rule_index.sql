create index if not exists assessment_resources_rule_idx
  on public.assessment_resources(rule_id)
  where rule_id is not null;
