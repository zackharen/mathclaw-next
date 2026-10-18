-- "Screen can read session by token" was `using (true)` for every role, so anyone
-- holding the public anon key could read every projector session, screen tokens
-- included. Screens and every token lookup go through API routes on the
-- service-role client, which bypasses RLS; teachers keep "Teacher owns their session".
drop policy if exists "Screen can read session by token" on public.projector_sessions;
