-- Migration: add grace_day to course_calendar_days.day_type check constraint
-- Grace days are school days (keep A/B label, no lesson assigned) that are class-specific
-- and should not be copied to other classes via the Copy Calendar action.

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'course_calendar_days'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%day_type%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE course_calendar_days DROP CONSTRAINT %I', v_constraint);
  END IF;
END
$$;

ALTER TABLE course_calendar_days
  ADD CONSTRAINT course_calendar_days_day_type_check
  CHECK (day_type IN ('instructional', 'off', 'half', 'modified', 'grace_day'));
