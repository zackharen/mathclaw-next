drop policy if exists "Course teachers read assessment support settings"
  on public.course_assessment_support_settings;
drop policy if exists "Enrolled students read published assessment support settings"
  on public.course_assessment_support_settings;

create policy "Authorized users read assessment support settings"
on public.course_assessment_support_settings for select to authenticated
using (
  exists (
    select 1 from public.courses
    where courses.id = course_assessment_support_settings.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
  or (
    is_published
    and public.rls_is_enrolled_in_course((select auth.uid()), course_id)
  )
);

drop policy if exists "Course teachers read assessment supports"
  on public.course_assessment_supports;
drop policy if exists "Enrolled students read enabled published assessment supports"
  on public.course_assessment_supports;

create policy "Authorized users read assessment supports"
on public.course_assessment_supports for select to authenticated
using (
  exists (
    select 1 from public.courses
    where courses.id = course_assessment_supports.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
  or (
    enabled
    and public.rls_is_enrolled_in_course((select auth.uid()), course_id)
    and exists (
      select 1 from public.course_assessment_support_settings settings
      where settings.course_id = course_assessment_supports.course_id
        and settings.is_published
    )
  )
);

drop policy if exists "Course teachers read assessment support usages"
  on public.assessment_support_usages;
drop policy if exists "Students read only their own assessment support usages"
  on public.assessment_support_usages;

create policy "Authorized users read assessment support usages"
on public.assessment_support_usages for select to authenticated
using (
  exists (
    select 1 from public.courses
    where courses.id = assessment_support_usages.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
  or (
    student_id = (select auth.uid())
    and public.rls_is_enrolled_in_course((select auth.uid()), course_id)
  )
);

create index if not exists course_assessment_support_settings_updated_by_idx
  on public.course_assessment_support_settings(updated_by)
  where updated_by is not null;

create index if not exists assessment_support_overrides_rule_idx
  on public.assessment_support_cost_overrides(rule_id);

create index if not exists assessment_support_overrides_updated_by_idx
  on public.assessment_support_cost_overrides(updated_by);

create index if not exists assessment_support_activations_recorded_by_idx
  on public.assessment_support_activations(recorded_by);

create index if not exists assessment_support_activations_voided_by_idx
  on public.assessment_support_activations(voided_by)
  where voided_by is not null;

create index if not exists assessment_support_usages_activation_idx
  on public.assessment_support_usages(activation_id)
  where activation_id is not null;

create index if not exists assessment_support_usages_support_idx
  on public.assessment_support_usages(support_id);

create index if not exists assessment_support_usages_recorded_by_idx
  on public.assessment_support_usages(recorded_by);

create index if not exists assessment_support_usages_voided_by_idx
  on public.assessment_support_usages(voided_by)
  where voided_by is not null;
