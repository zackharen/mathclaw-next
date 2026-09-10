create index if not exists assessment_support_overrides_support_course_idx
  on public.assessment_support_cost_overrides(support_id, course_id);

create index if not exists assessment_support_activations_support_course_idx
  on public.assessment_support_activations(support_id, course_id);

create index if not exists assessment_support_usages_support_course_idx
  on public.assessment_support_usages(support_id, course_id);
