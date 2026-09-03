-- Follow-up for environments that applied the first archive migration before
-- its enrolled-student policy was corrected to use the recursion-safe helper.
drop policy if exists "courses: enrolled student read" on public.courses;

create policy "courses: enrolled student read"
on public.courses
for select
to authenticated
using (
  archived_at is null
  and public.rls_is_enrolled_in_course(auth.uid(), id)
);
