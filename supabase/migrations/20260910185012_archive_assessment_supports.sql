alter table public.course_assessment_supports
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.course_assessment_supports
  add constraint archived_assessment_supports_are_disabled
  check (archived_at is null or not enabled);

create index if not exists course_assessment_supports_archived_by_idx
  on public.course_assessment_supports(archived_by)
  where archived_by is not null;

drop policy if exists "Authorized users read assessment supports"
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
    archived_at is null
    and enabled
    and public.rls_is_enrolled_in_course((select auth.uid()), course_id)
    and exists (
      select 1 from public.course_assessment_support_settings settings
      where settings.course_id = course_assessment_supports.course_id
        and settings.is_published
    )
  )
);
