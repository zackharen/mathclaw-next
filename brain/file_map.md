# File Map

Use this as a quick routing map. Load specific files only when the task requires them.

## Brain

- `brain/START_HERE.md` - stable entrypoint for future AI sessions.
- `brain/session_handoff.md` - current project state, next steps, known issues, and risks.
- `brain/conventions.md` - code style, UI patterns, delivery convention, command shortcuts.
- `brain/coding_agent_principles.md` - agent behavior, assumptions, surgical edits, verification.
- `brain/codex_workflows.md` - when to use Codex tools beyond terminal-only work.
- `brain/feature_context/INDEX.md` - route to the smallest relevant feature-context file.
- `brain/history.md` - append-only history; load only for timelines or attention-allocation questions.
- `brain/future_ideas.md` - future ideas bank; load only for backlog/roadmap/todo questions.

## App Routes

- `app/page.js` - minimal homepage.
- `app/about/page.js` - about and mission page.
- `app/layout.js` - global shell, nav, role chip, site-wide banners.
- `app/auth/*` - sign-in, sign-up, callback, and auth actions.
- `app/onboarding/profile/*` - profile setup and account-type onboarding.
- `app/classes/*` - teacher class list and class creation.
- `app/teachers/*` - teacher discovery/listing.
- `app/report-bug/*` - bug report form and actions.
- `app/admin/page.js` - admin dashboard views.
- `app/admin/actions.js` - admin mutations and redirects.
- `app/play/page.js` - student/player arcade hub.
- `app/play/actions.js` - play/class join actions.

## Game Routes

- `app/play/double-board/page.js` and `game-client.js` - Double Board.
- `app/api/play/double-board/route.js` - Double Board API/session actions.
- `app/play/lowest-number-wins/page.js` and `game-client.js` - Lowest Number Wins.
- `app/api/play/lowest-number-wins/route.js` - Lowest Number Wins API/session actions.
- `app/play/open-middle/page.js`, `game-client.js`, `[sessionId]/page.js`, `[sessionId]/game-client.js` - Open Middle authoring and live play.
- `app/api/play/open-middle/route.js` - Open Middle API/session actions.
- `app/play/integer-practice/page.js` and `game-client.js` - Integer Practice.
- Other arcade games live under `app/play/<slug>/page.js` and usually `game-client.js`.

## Shared Libraries

- `lib/supabase/server.js`, `client.js`, `admin.js`, `middleware.js` - Supabase clients and middleware support.
- `lib/auth/account-type.js`, `admin-scope.js`, `owner.js`, `session-metadata.js` - auth/account helpers.
- `lib/student-games/catalog.js` - arcade/game catalog.
- `lib/student-games/stats.js` - game stats persistence.
- `lib/question-engine/*` - shared question generation and adaptive engines.
- `lib/integer-practice/*` - Integer Practice engine, levels, progression, and mastery settings.
- `lib/open-middle/core.js` - Open Middle parsing and validation.
- `lib/site-config.js` - editable site copy and config defaults.
- `lib/math-display.js` - shared math display helpers.
- `lib/observability/events.js` - event/internal logging helpers.

## Database And Tests

- `supabase/schema.sql` - schema snapshot/reference.
- `supabase/migrations_*.sql` - date-prefixed database migrations.
- `tests/integer-progression.test.mjs` - current focused Node test suite.

## Special Cautions

- Do not touch `supabase/migrations_20260331_join_course_by_code_rpc.sql` unless explicitly asked.
- Keep production-schema fallbacks intact unless a migration is confirmed live.
- Treat untracked files as real work that may need staging; check `git status` before commit/push.
