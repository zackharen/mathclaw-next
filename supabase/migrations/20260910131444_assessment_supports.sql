create table if not exists public.course_assessment_support_settings (
  course_id uuid primary key references public.courses(id) on delete cascade,
  starting_cost integer not null default 5 check (starting_cost between 0 and 1000),
  cost_increment integer not null default 5 check (cost_increment between 0 and 1000),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.course_assessment_supports (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  source_key text not null check (source_key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 400),
  sort_order integer not null check (sort_order >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, source_key),
  unique (id, course_id)
);

create table if not exists public.assessment_support_cost_overrides (
  course_id uuid not null references public.courses(id) on delete cascade,
  support_id uuid not null,
  rule_id uuid not null references public.teacher_announcement_assignment_rules(id) on delete cascade,
  original_date date not null,
  cost integer not null check (cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  primary key (support_id, rule_id, original_date),
  foreign key (support_id, course_id)
    references public.course_assessment_supports(id, course_id) on delete cascade
);

create table if not exists public.assessment_support_activations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  support_id uuid not null,
  rule_id uuid not null,
  original_date date not null,
  assignment_date date not null,
  assessment_label text not null check (char_length(trim(assessment_label)) between 1 and 160),
  assessment_number text not null check (assessment_number ~ '^[1-9][0-9]*\.[1-9][0-9]*$'),
  marking_period_name text not null check (char_length(trim(marking_period_name)) between 1 and 120),
  marking_period_number integer not null check (marking_period_number > 0),
  charged_cost integer not null check (charged_cost >= 0),
  activated_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete restrict,
  foreign key (support_id, course_id)
    references public.course_assessment_supports(id, course_id) on delete restrict,
  unique nulls not distinct (support_id, rule_id, original_date)
);

create table if not exists public.assessment_support_usages (
  id uuid primary key default gen_random_uuid(),
  activation_id uuid references public.assessment_support_activations(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete cascade,
  support_id uuid not null,
  rule_id uuid not null,
  original_date date not null,
  assignment_date date not null,
  assessment_label text not null check (char_length(trim(assessment_label)) between 1 and 160),
  assessment_number text not null check (assessment_number ~ '^[1-9][0-9]*\.[1-9][0-9]*$'),
  marking_period_name text not null check (char_length(trim(marking_period_name)) between 1 and 120),
  marking_period_number integer not null check (marking_period_number > 0),
  student_id uuid not null references public.profiles(id) on delete restrict,
  support_name text not null check (char_length(trim(support_name)) between 1 and 80),
  support_description text not null default '' check (char_length(support_description) <= 400),
  usage_type text not null check (usage_type in ('optional_deduction', 'required_accommodation')),
  charged_cost integer not null check (charged_cost >= 0),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete restrict,
  void_reason text check (void_reason is null or char_length(void_reason) <= 240),
  foreign key (support_id, course_id)
    references public.course_assessment_supports(id, course_id) on delete restrict,
  check (
    (usage_type = 'required_accommodation' and charged_cost = 0 and activation_id is null)
    or
    (usage_type = 'optional_deduction' and activation_id is not null)
  )
);

create unique index if not exists assessment_support_usages_active_unique
  on public.assessment_support_usages(student_id, support_id, rule_id, original_date)
  where voided_at is null;

create index if not exists assessment_supports_course_order_idx
  on public.course_assessment_supports(course_id, sort_order, id);

create index if not exists assessment_support_overrides_occurrence_idx
  on public.assessment_support_cost_overrides(course_id, rule_id, original_date, support_id);

create index if not exists assessment_support_activations_period_idx
  on public.assessment_support_activations(course_id, support_id, marking_period_number, activated_at)
  where voided_at is null;

create index if not exists assessment_support_usages_roster_idx
  on public.assessment_support_usages(course_id, rule_id, original_date, student_id, recorded_at);

create index if not exists assessment_support_usages_student_idx
  on public.assessment_support_usages(student_id, course_id, recorded_at desc);

alter table public.course_assessment_support_settings enable row level security;
alter table public.course_assessment_supports enable row level security;
alter table public.assessment_support_cost_overrides enable row level security;
alter table public.assessment_support_activations enable row level security;
alter table public.assessment_support_usages enable row level security;

create policy "Course teachers read assessment support settings"
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
);

create policy "Enrolled students read published assessment support settings"
on public.course_assessment_support_settings for select to authenticated
using (
  is_published
  and public.rls_is_enrolled_in_course((select auth.uid()), course_id)
);

create policy "Course teachers insert assessment support settings"
on public.course_assessment_support_settings for insert to authenticated
with check (
  exists (
    select 1 from public.courses
    where courses.id = course_assessment_support_settings.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
);

create policy "Course teachers update assessment support settings"
on public.course_assessment_support_settings for update to authenticated
using (
  exists (
    select 1 from public.courses
    where courses.id = course_assessment_support_settings.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
)
with check (
  exists (
    select 1 from public.courses
    where courses.id = course_assessment_support_settings.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
);

create policy "Course teachers read assessment supports"
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
);

create policy "Enrolled students read enabled published assessment supports"
on public.course_assessment_supports for select to authenticated
using (
  enabled
  and public.rls_is_enrolled_in_course((select auth.uid()), course_id)
  and exists (
    select 1 from public.course_assessment_support_settings settings
    where settings.course_id = course_assessment_supports.course_id
      and settings.is_published
  )
);

create policy "Course teachers update assessment supports"
on public.course_assessment_supports for update to authenticated
using (
  exists (
    select 1 from public.courses
    where courses.id = course_assessment_supports.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
)
with check (
  exists (
    select 1 from public.courses
    where courses.id = course_assessment_supports.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
);

create policy "Course teachers manage assessment support overrides"
on public.assessment_support_cost_overrides for all to authenticated
using (
  exists (
    select 1 from public.courses
    where courses.id = assessment_support_cost_overrides.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
)
with check (
  updated_by = (select auth.uid())
  and exists (
    select 1 from public.courses
    where courses.id = assessment_support_cost_overrides.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
);

create policy "Course teachers read assessment support activations"
on public.assessment_support_activations for select to authenticated
using (
  exists (
    select 1 from public.courses
    where courses.id = assessment_support_activations.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
);

create policy "Course teachers insert assessment support activations"
on public.assessment_support_activations for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and exists (
    select 1 from public.courses
    where courses.id = assessment_support_activations.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
);

create policy "Course teachers update assessment support activations"
on public.assessment_support_activations for update to authenticated
using (
  exists (
    select 1 from public.courses
    where courses.id = assessment_support_activations.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
)
with check (
  exists (
    select 1 from public.courses
    where courses.id = assessment_support_activations.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
);

create policy "Course teachers read assessment support usages"
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
);

create policy "Students read only their own assessment support usages"
on public.assessment_support_usages for select to authenticated
using (
  student_id = (select auth.uid())
  and public.rls_is_enrolled_in_course((select auth.uid()), course_id)
);

create policy "Course teachers insert assessment support usages"
on public.assessment_support_usages for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and exists (
    select 1 from public.courses
    where courses.id = assessment_support_usages.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
);

create policy "Course teachers void assessment support usages"
on public.assessment_support_usages for update to authenticated
using (
  exists (
    select 1 from public.courses
    where courses.id = assessment_support_usages.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
)
with check (
  exists (
    select 1 from public.courses
    where courses.id = assessment_support_usages.course_id
      and (
        courses.owner_id = (select auth.uid())
        or public.rls_is_co_teacher_of_course((select auth.uid()), courses.id)
      )
  )
);

revoke all on table public.course_assessment_support_settings from anon, authenticated;
revoke all on table public.course_assessment_supports from anon, authenticated;
revoke all on table public.assessment_support_cost_overrides from anon, authenticated;
revoke all on table public.assessment_support_activations from anon, authenticated;
revoke all on table public.assessment_support_usages from anon, authenticated;

grant select, insert, update on table public.course_assessment_support_settings to authenticated;
grant select, update on table public.course_assessment_supports to authenticated;
grant select, insert, update, delete on table public.assessment_support_cost_overrides to authenticated;
grant select, insert, update on table public.assessment_support_activations to authenticated;
grant select, insert, update on table public.assessment_support_usages to authenticated;

create or replace function public.record_assessment_support_usage(
  p_course_id uuid,
  p_support_id uuid,
  p_student_id uuid,
  p_rule_id uuid,
  p_original_date date,
  p_assignment_date date,
  p_assessment_label text,
  p_assessment_number text,
  p_marking_period_name text,
  p_marking_period_number integer,
  p_required_accommodation boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  support_row public.course_assessment_supports%rowtype;
  settings_row public.course_assessment_support_settings%rowtype;
  activation_row public.assessment_support_activations%rowtype;
  override_cost integer;
  prior_activations integer;
  usage_id uuid;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into support_row
  from public.course_assessment_supports
  where id = p_support_id and course_id = p_course_id and enabled
  for update;

  if not found then
    raise exception 'Assessment support is unavailable';
  end if;

  if not public.rls_is_enrolled_in_course(p_student_id, p_course_id) then
    raise exception 'Student is not enrolled in this class';
  end if;

  if p_required_accommodation then
    insert into public.assessment_support_usages (
      course_id, support_id, rule_id, original_date, assignment_date,
      assessment_label, assessment_number, marking_period_name, marking_period_number,
      student_id, support_name, support_description, usage_type, charged_cost, recorded_by
    ) values (
      p_course_id, p_support_id, p_rule_id, p_original_date, p_assignment_date,
      p_assessment_label, p_assessment_number, p_marking_period_name, p_marking_period_number,
      p_student_id, support_row.name, support_row.description,
      'required_accommodation', 0, current_uid
    ) returning id into usage_id;

    return usage_id;
  end if;

  select * into settings_row
  from public.course_assessment_support_settings
  where course_id = p_course_id;

  if not found then
    raise exception 'Assessment support settings are unavailable';
  end if;

  select * into activation_row
  from public.assessment_support_activations
  where support_id = p_support_id
    and rule_id = p_rule_id
    and original_date = p_original_date
  for update;

  if found then
    if activation_row.voided_at is not null then
      update public.assessment_support_activations
      set voided_at = null, voided_by = null
      where id = activation_row.id
      returning * into activation_row;
    end if;
  else
    select cost into override_cost
    from public.assessment_support_cost_overrides
    where support_id = p_support_id
      and rule_id = p_rule_id
      and original_date = p_original_date;

    select count(*)::integer into prior_activations
    from public.assessment_support_activations
    where course_id = p_course_id
      and support_id = p_support_id
      and marking_period_number = p_marking_period_number
      and voided_at is null;

    insert into public.assessment_support_activations (
      course_id, support_id, rule_id, original_date, assignment_date,
      assessment_label, assessment_number, marking_period_name, marking_period_number,
      charged_cost, recorded_by
    ) values (
      p_course_id, p_support_id, p_rule_id, p_original_date, p_assignment_date,
      p_assessment_label, p_assessment_number, p_marking_period_name, p_marking_period_number,
      coalesce(override_cost, settings_row.starting_cost + settings_row.cost_increment * prior_activations),
      current_uid
    ) returning * into activation_row;
  end if;

  insert into public.assessment_support_usages (
    activation_id, course_id, support_id, rule_id, original_date, assignment_date,
    assessment_label, assessment_number, marking_period_name, marking_period_number,
    student_id, support_name, support_description, usage_type, charged_cost, recorded_by
  ) values (
    activation_row.id, p_course_id, p_support_id, p_rule_id, p_original_date, p_assignment_date,
    p_assessment_label, p_assessment_number, p_marking_period_name, p_marking_period_number,
    p_student_id, support_row.name, support_row.description,
    'optional_deduction', activation_row.charged_cost, current_uid
  ) returning id into usage_id;

  return usage_id;
end;
$$;

create or replace function public.void_assessment_support_usage(
  p_usage_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
  usage_row public.assessment_support_usages%rowtype;
begin
  if current_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into usage_row
  from public.assessment_support_usages
  where id = p_usage_id
  for update;

  if not found then
    raise exception 'Assessment support record was not found';
  end if;

  if usage_row.voided_at is null then
    update public.assessment_support_usages
    set
      voided_at = now(),
      voided_by = current_uid,
      void_reason = nullif(left(trim(coalesce(p_reason, '')), 240), '')
    where id = usage_row.id;

    if usage_row.activation_id is not null and not exists (
      select 1 from public.assessment_support_usages
      where activation_id = usage_row.activation_id
        and id <> usage_row.id
        and voided_at is null
    ) then
      update public.assessment_support_activations
      set voided_at = now(), voided_by = current_uid
      where id = usage_row.activation_id;
    end if;
  end if;

  return usage_row.id;
end;
$$;

revoke execute on function public.record_assessment_support_usage(uuid, uuid, uuid, uuid, date, date, text, text, text, integer, boolean) from public, anon;
revoke execute on function public.void_assessment_support_usage(uuid, text) from public, anon;
grant execute on function public.record_assessment_support_usage(uuid, uuid, uuid, uuid, date, date, text, text, text, integer, boolean) to authenticated;
grant execute on function public.void_assessment_support_usage(uuid, text) to authenticated;

create or replace function public.protect_assessment_support_usage_history()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if row(
    new.activation_id, new.course_id, new.support_id, new.rule_id,
    new.original_date, new.assignment_date, new.assessment_label,
    new.assessment_number, new.marking_period_name, new.marking_period_number,
    new.student_id, new.support_name, new.support_description,
    new.usage_type, new.charged_cost, new.recorded_at, new.recorded_by
  ) is distinct from row(
    old.activation_id, old.course_id, old.support_id, old.rule_id,
    old.original_date, old.assignment_date, old.assessment_label,
    old.assessment_number, old.marking_period_name, old.marking_period_number,
    old.student_id, old.support_name, old.support_description,
    old.usage_type, old.charged_cost, old.recorded_at, old.recorded_by
  ) then
    raise exception 'Assessment support history is immutable; void and replace the record instead';
  end if;

  if old.voided_at is not null and row(new.voided_at, new.voided_by, new.void_reason)
    is distinct from row(old.voided_at, old.voided_by, old.void_reason) then
    raise exception 'A voided assessment support record cannot be changed';
  end if;

  if old.voided_at is null and new.voided_at is null
    and row(new.voided_by, new.void_reason) is distinct from row(old.voided_by, old.void_reason) then
    raise exception 'Void metadata requires a void timestamp';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_assessment_support_usage_history() from public, anon, authenticated;

drop trigger if exists protect_assessment_support_usage_history on public.assessment_support_usages;
create trigger protect_assessment_support_usage_history
before update on public.assessment_support_usages
for each row execute function public.protect_assessment_support_usage_history();

create or replace function public.initialize_assessment_supports_for_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.course_assessment_support_settings (course_id)
  values (new.id)
  on conflict (course_id) do nothing;

  insert into public.course_assessment_supports (course_id, source_key, name, description, sort_order)
  values
    (new.id, 'notes_reference_sheet', 'Notes/reference sheet', 'Use approved notes or a teacher-approved reference sheet.', 10),
    (new.id, 'limited_peer_consultation', 'Limited peer consultation', 'Briefly consult with a peer within the teacher-defined limit.', 20),
    (new.id, 'teacher_hint', 'Teacher hint', 'Receive a focused hint from the teacher.', 30),
    (new.id, 'teacher_conference', 'Teacher conference', 'Pause for a short problem-solving conference with the teacher.', 40),
    (new.id, 'formula_bank_worked_example', 'Formula bank or worked example', 'Use an approved formula bank or a comparable worked example.', 50),
    (new.id, 'calculator_privilege', 'Calculator privilege', 'Use a calculator when it is not otherwise part of the assessment.', 60),
    (new.id, 'one_answer_check', 'One-answer check', 'Ask the teacher to check whether one answer is correct.', 70),
    (new.id, 'skip_replace_problem', 'Skip or replace one problem', 'Skip one problem or complete a teacher-selected replacement.', 80),
    (new.id, 'optional_additional_time', 'Optional additional time', 'Use teacher-approved additional time beyond the standard window.', 90),
    (new.id, 'corrections_opportunity', 'Corrections opportunity', 'Complete corrections under the class assessment-support policy.', 100)
  on conflict (course_id, source_key) do nothing;

  return new;
end;
$$;

revoke execute on function public.initialize_assessment_supports_for_course() from public, anon, authenticated;

drop trigger if exists initialize_assessment_supports_after_course_insert on public.courses;
create trigger initialize_assessment_supports_after_course_insert
after insert on public.courses
for each row execute function public.initialize_assessment_supports_for_course();

insert into public.course_assessment_support_settings (course_id)
select id from public.courses
on conflict (course_id) do nothing;

insert into public.course_assessment_supports (course_id, source_key, name, description, sort_order)
select courses.id, defaults.source_key, defaults.name, defaults.description, defaults.sort_order
from public.courses
cross join (values
  ('notes_reference_sheet', 'Notes/reference sheet', 'Use approved notes or a teacher-approved reference sheet.', 10),
  ('limited_peer_consultation', 'Limited peer consultation', 'Briefly consult with a peer within the teacher-defined limit.', 20),
  ('teacher_hint', 'Teacher hint', 'Receive a focused hint from the teacher.', 30),
  ('teacher_conference', 'Teacher conference', 'Pause for a short problem-solving conference with the teacher.', 40),
  ('formula_bank_worked_example', 'Formula bank or worked example', 'Use an approved formula bank or a comparable worked example.', 50),
  ('calculator_privilege', 'Calculator privilege', 'Use a calculator when it is not otherwise part of the assessment.', 60),
  ('one_answer_check', 'One-answer check', 'Ask the teacher to check whether one answer is correct.', 70),
  ('skip_replace_problem', 'Skip or replace one problem', 'Skip one problem or complete a teacher-selected replacement.', 80),
  ('optional_additional_time', 'Optional additional time', 'Use teacher-approved additional time beyond the standard window.', 90),
  ('corrections_opportunity', 'Corrections opportunity', 'Complete corrections under the class assessment-support policy.', 100)
) as defaults(source_key, name, description, sort_order)
on conflict (course_id, source_key) do nothing;
