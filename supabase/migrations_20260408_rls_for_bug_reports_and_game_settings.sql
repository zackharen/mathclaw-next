alter table public.bug_reports enable row level security;
alter table public.course_game_settings enable row level security;
alter table public.internal_event_logs enable row level security;

drop policy if exists "bug reports service role only" on public.bug_reports;
drop policy if exists "course game settings owner select" on public.course_game_settings;
drop policy if exists "course game settings owner insert" on public.course_game_settings;
drop policy if exists "course game settings owner update" on public.course_game_settings;
drop policy if exists "course game settings owner delete" on public.course_game_settings;
drop policy if exists "internal event logs service role only" on public.internal_event_logs;

create policy "course game settings owner select"
on public.course_game_settings
for select
using (
  exists (
    select 1
    from public.courses
    where courses.id = course_game_settings.course_id
      and courses.owner_id = auth.uid()
  )
);

create policy "course game settings owner insert"
on public.course_game_settings
for insert
with check (
  exists (
    select 1
    from public.courses
    where courses.id = course_game_settings.course_id
      and courses.owner_id = auth.uid()
  )
);

create policy "course game settings owner update"
on public.course_game_settings
for update
using (
  exists (
    select 1
    from public.courses
    where courses.id = course_game_settings.course_id
      and courses.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.courses
    where courses.id = course_game_settings.course_id
      and courses.owner_id = auth.uid()
  )
);

create policy "course game settings owner delete"
on public.course_game_settings
for delete
using (
  exists (
    select 1
    from public.courses
    where courses.id = course_game_settings.course_id
      and courses.owner_id = auth.uid()
  )
);
