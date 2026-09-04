drop policy if exists "Assessment resource owners manage lesson links" on public.assessment_resource_lessons;

create policy "Assessment resource owners create lesson links"
on public.assessment_resource_lessons
for insert
to authenticated
with check (
  exists (
    select 1 from public.assessment_resources resource
    where resource.id = assessment_resource_lessons.resource_id
      and resource.owner_id = (select auth.uid())
  )
);

create policy "Assessment resource owners update lesson links"
on public.assessment_resource_lessons
for update
to authenticated
using (
  exists (
    select 1 from public.assessment_resources resource
    where resource.id = assessment_resource_lessons.resource_id
      and resource.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.assessment_resources resource
    where resource.id = assessment_resource_lessons.resource_id
      and resource.owner_id = (select auth.uid())
  )
);

create policy "Assessment resource owners delete lesson links"
on public.assessment_resource_lessons
for delete
to authenticated
using (
  exists (
    select 1 from public.assessment_resources resource
    where resource.id = assessment_resource_lessons.resource_id
      and resource.owner_id = (select auth.uid())
  )
);
