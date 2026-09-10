begin;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(value, false) then
    raise exception 'Assessment supports RLS test failed: %', message;
  end if;
end;
$$;

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'assessment-teacher@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'assessment-student-one@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'assessment-student-two@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'assessment-outsider@example.test');

insert into public.profiles (id, display_name, account_type)
values
  ('10000000-0000-0000-0000-000000000001', 'Assessment Teacher', 'teacher'),
  ('10000000-0000-0000-0000-000000000002', 'Assessment Student One', 'student'),
  ('10000000-0000-0000-0000-000000000003', 'Assessment Student Two', 'student'),
  ('10000000-0000-0000-0000-000000000004', 'Assessment Outsider', 'student');

insert into public.courses (
  id, owner_id, title, class_name, schedule_model, school_year_start, school_year_end
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Assessment RLS Test',
  'Assessment RLS Test',
  'every_day',
  '2026-09-01',
  '2027-06-30'
);

insert into public.student_course_memberships (course_id, profile_id)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003');

update public.course_assessment_support_settings
set is_published = true, updated_by = '10000000-0000-0000-0000-000000000001'
where course_id = '20000000-0000-0000-0000-000000000001';

insert into public.assessment_support_usages (
  course_id, support_id, rule_id, original_date, assignment_date,
  assessment_label, assessment_number, marking_period_name, marking_period_number,
  student_id, support_name, support_description, usage_type, charged_cost, recorded_by
)
select
  '20000000-0000-0000-0000-000000000001', id,
  '30000000-0000-0000-0000-000000000001', '2026-09-10', '2026-09-10',
  'Assessment', '1.1', 'Quarter 1', 1,
  student_id, name, description, 'required_accommodation', 0,
  '10000000-0000-0000-0000-000000000001'
from public.course_assessment_supports
cross join (values
  ('10000000-0000-0000-0000-000000000002'::uuid),
  ('10000000-0000-0000-0000-000000000003'::uuid)
) as students(student_id)
where course_id = '20000000-0000-0000-0000-000000000001'
  and source_key = 'notes_reference_sheet';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select pg_temp.assert_true(
  (select count(*) = 10 from public.course_assessment_supports where course_id = '20000000-0000-0000-0000-000000000001'),
  'the class teacher reads every support'
);
select pg_temp.assert_true(
  (select count(*) = 2 from public.assessment_support_usages where course_id = '20000000-0000-0000-0000-000000000001'),
  'the class teacher reads the full roster ledger'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select pg_temp.assert_true(
  (select count(*) = 1 from public.course_assessment_support_settings where course_id = '20000000-0000-0000-0000-000000000001'),
  'an enrolled student reads published settings'
);
select pg_temp.assert_true(
  (select count(*) = 10 from public.course_assessment_supports where course_id = '20000000-0000-0000-0000-000000000001'),
  'an enrolled student reads the enabled published catalog'
);
select pg_temp.assert_true(
  (select count(*) = 1 and max(student_id::text) = '10000000-0000-0000-0000-000000000002'
   from public.assessment_support_usages where course_id = '20000000-0000-0000-0000-000000000001'),
  'a student reads only their own usage row'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.assessment_support_activations where course_id = '20000000-0000-0000-0000-000000000001'),
  'students cannot read class-wide activation history'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.assessment_support_cost_overrides where course_id = '20000000-0000-0000-0000-000000000001'),
  'students cannot read teacher override records'
);
do $$
begin
  begin
    insert into public.assessment_support_usages (
      course_id, support_id, rule_id, original_date, assignment_date,
      assessment_label, assessment_number, marking_period_name, marking_period_number,
      student_id, support_name, usage_type, charged_cost, recorded_by
    ) select
      '20000000-0000-0000-0000-000000000001', id,
      '30000000-0000-0000-0000-000000000001', '2026-09-10', '2026-09-10',
      'Assessment', '1.1', 'Quarter 1', 1,
      '10000000-0000-0000-0000-000000000002', name,
      'required_accommodation', 0, '10000000-0000-0000-0000-000000000002'
    from public.course_assessment_supports
    where course_id = '20000000-0000-0000-0000-000000000001'
      and source_key = 'teacher_hint';
    raise exception 'Assessment supports RLS test failed: students cannot insert usage records';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select pg_temp.assert_true(
  (select count(*) = 1 and max(student_id::text) = '10000000-0000-0000-0000-000000000003'
   from public.assessment_support_usages where course_id = '20000000-0000-0000-0000-000000000001'),
  'a second student cannot read the first student record'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select pg_temp.assert_true(
  (select count(*) = 0 from public.course_assessment_support_settings where course_id = '20000000-0000-0000-0000-000000000001'),
  'a non-member cannot read published settings'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.course_assessment_supports where course_id = '20000000-0000-0000-0000-000000000001'),
  'a non-member cannot read the published catalog'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.assessment_support_usages where course_id = '20000000-0000-0000-0000-000000000001'),
  'a non-member cannot read student usage records'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select public.record_assessment_support_usage(
  '20000000-0000-0000-0000-000000000001',
  (select id from public.course_assessment_supports where course_id = '20000000-0000-0000-0000-000000000001' and source_key = 'limited_peer_consultation'),
  '10000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  '2026-09-09', '2026-09-09', 'Assessment', '1.9', 'Quarter 1', 1, true
);
select public.record_assessment_support_usage(
  '20000000-0000-0000-0000-000000000001',
  (select id from public.course_assessment_supports where course_id = '20000000-0000-0000-0000-000000000001' and source_key = 'limited_peer_consultation'),
  '10000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  '2026-09-10', '2026-09-10', 'Assessment', '1.1', 'Quarter 1', 1, false
);
select public.record_assessment_support_usage(
  '20000000-0000-0000-0000-000000000001',
  (select id from public.course_assessment_supports where course_id = '20000000-0000-0000-0000-000000000001' and source_key = 'teacher_hint'),
  '10000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  '2026-09-10', '2026-09-10', 'Assessment', '1.1', 'Quarter 1', 1, false
);
select public.record_assessment_support_usage(
  '20000000-0000-0000-0000-000000000001',
  (select id from public.course_assessment_supports where course_id = '20000000-0000-0000-0000-000000000001' and source_key = 'teacher_hint'),
  '10000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000001',
  '2026-09-10', '2026-09-10', 'Assessment', '1.1', 'Quarter 1', 1, false
);
select public.record_assessment_support_usage(
  '20000000-0000-0000-0000-000000000001',
  (select id from public.course_assessment_supports where course_id = '20000000-0000-0000-0000-000000000001' and source_key = 'teacher_hint'),
  '10000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  '2026-09-17', '2026-09-17', 'Assessment', '1.2', 'Quarter 1', 1, false
);
select public.record_assessment_support_usage(
  '20000000-0000-0000-0000-000000000001',
  (select id from public.course_assessment_supports where course_id = '20000000-0000-0000-0000-000000000001' and source_key = 'teacher_hint'),
  '10000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  '2026-11-12', '2026-11-12', 'Assessment', '2.1', 'Quarter 2', 2, false
);

select pg_temp.assert_true(
  (select charged_cost = 5 from public.assessment_support_usages
   where support_name = 'Limited peer consultation' and usage_type = 'optional_deduction'),
  'a required accommodation does not raise that support price'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.assessment_support_activations activations
   join public.course_assessment_supports supports on supports.id = activations.support_id
   where supports.source_key = 'limited_peer_consultation' and activations.voided_at is null),
  'required accommodations do not create class-wide activations'
);
select pg_temp.assert_true(
  (select count(distinct charged_cost) = 1 and min(charged_cost) = 5
   from public.assessment_support_usages
   where support_name = 'Teacher hint' and assessment_number = '1.1'),
  'all students share one snapshotted support price on an assessment'
);
select pg_temp.assert_true(
  (select charged_cost = 10 from public.assessment_support_activations activations
   join public.course_assessment_supports supports on supports.id = activations.support_id
   where supports.source_key = 'teacher_hint' and activations.assessment_number = '1.2'),
  'a support price rises after the class activates that support on a prior assessment'
);
select pg_temp.assert_true(
  (select charged_cost = 5 from public.assessment_support_activations activations
   join public.course_assessment_supports supports on supports.id = activations.support_id
   where supports.source_key = 'teacher_hint' and activations.assessment_number = '2.1'),
  'the same support resets to its starting price in the next marking period'
);

do $$
begin
  begin
    update public.assessment_support_activations
    set charged_cost = charged_cost + 1
    where course_id = '20000000-0000-0000-0000-000000000001'
      and assessment_number = '1.1';
    raise exception 'Assessment supports RLS test failed: activation snapshots cannot be repriced';
  exception
    when raise_exception then
      if sqlerrm = 'Assessment supports RLS test failed: activation snapshots cannot be repriced' then
        raise;
      end if;
  end;
end;
$$;

rollback;
