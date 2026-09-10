create or replace function public.protect_assessment_support_activation_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(
    new.id, new.course_id, new.support_id, new.rule_id,
    new.original_date, new.assignment_date, new.assessment_label,
    new.assessment_number, new.marking_period_name, new.marking_period_number,
    new.charged_cost, new.activated_at, new.recorded_by
  ) is distinct from row(
    old.id, old.course_id, old.support_id, old.rule_id,
    old.original_date, old.assignment_date, old.assessment_label,
    old.assessment_number, old.marking_period_name, old.marking_period_number,
    old.charged_cost, old.activated_at, old.recorded_by
  ) then
    raise exception 'Assessment support activation history is immutable';
  end if;

  if old.voided_at is not null
    and row(new.voided_at, new.voided_by) is distinct from row(old.voided_at, old.voided_by) then
    if not (new.voided_at is null and new.voided_by is null) then
      raise exception 'A voided assessment support activation may only be restored';
    end if;
  end if;

  if old.voided_at is null and new.voided_at is null and new.voided_by is distinct from old.voided_by then
    raise exception 'Void metadata requires a void timestamp';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_assessment_support_activation_history() from public, anon, authenticated;

drop trigger if exists protect_assessment_support_activation_history on public.assessment_support_activations;
create trigger protect_assessment_support_activation_history
before update on public.assessment_support_activations
for each row execute function public.protect_assessment_support_activation_history();
