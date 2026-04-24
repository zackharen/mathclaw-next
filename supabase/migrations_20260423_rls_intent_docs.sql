-- Document the intended RLS posture for bug_reports and internal_event_logs.
--
-- These tables were given RLS in migrations_20260408_rls_for_bug_reports_and_game_settings.sql
-- but received no SELECT policies, meaning only the service-role admin client can read them.
-- This is intentional: bug reports and internal error logs are admin-only data and must not
-- be queryable by students, teachers, or arcade players via the anon or user JWT.
--
-- If a future feature needs reporters to view their own submissions, add a policy like:
--   create policy "bug reports reporter read own"
--   on public.bug_reports for select
--   using (reporter_email = (select email from auth.users where id = auth.uid()));
--
-- No policy changes are made by this migration. It exists only to make the intent explicit.

-- Verify RLS is still enabled (idempotent).
alter table public.bug_reports enable row level security;
alter table public.internal_event_logs enable row level security;
