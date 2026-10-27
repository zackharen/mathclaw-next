-- Custom lessons a teacher adds to one class. They are curriculum_lessons rows
-- in a hidden "Custom Lessons" library (so real libraries and other classes
-- never see them), owned by one course through course_id. Their place in the
-- class's sequence is an {insert, before} entry in courses.lesson_swaps.
-- Additive and safe to re-run.
alter table public.curriculum_lessons
  add column if not exists course_id uuid references public.courses(id) on delete cascade;

create index if not exists curriculum_lessons_course_id_idx
  on public.curriculum_lessons (course_id)
  where course_id is not null;

insert into public.curriculum_providers (code, name)
values ('mathclaw_custom', 'Custom Lessons')
on conflict (code) do nothing;

insert into public.curriculum_libraries (provider_id, class_code, class_name)
select id, 'mathclaw_custom_lessons', 'Custom Lessons'
from public.curriculum_providers
where code = 'mathclaw_custom'
on conflict (provider_id, class_code) do nothing;
