# Session Handoff

Read this file FIRST in future AI sessions before doing any work.

This file represents the **current state only**. It should stay short enough to be loaded in every new session without cost. When a session ends:
1. Move the prior "What Was Built" entries to `/brain/history.md` under a dated heading.
2. Rewrite "Current State Of The Project" to reflect *now*, not a log.
3. Prune obsolete items from "Next Recommended Steps" and "Known Issues."

## Last Updated
2026-04-26 America/New_York

## What Was Built (Current Session)
- Built **Lowest Number Wins** — a new live classroom game at `/play/lowest-number-wins` following the Double Board live-session architecture
- Files created: `app/play/lowest-number-wins/page.js`, `app/play/lowest-number-wins/game-client.js`, `app/api/play/lowest-number-wins/route.js`, `supabase/migrations_20260426_lowest_number_wins.sql`, `brain/feature_context/lowest_number_wins.md`
- Files modified: `lib/student-games/catalog.js` (added entry), `app/globals.css` (added LNW styles)
- Game rules: class-scoped, teacher-launched; students pick any number > 0 (integers or positive decimals per session setting); lowest unique number wins; draw if no unique number; teacher controls Start Round / Reveal / Next Round / End Session; picks hidden until teacher reveals; full per-name breakdown shown on reveal
- Historical data: `total_wins` per player, `game_sessions` rows on session end
- Projector mode: teacher-toggled fullscreen; live submission counter during picking; large winner announcement on reveal
- Build verified clean — `/play/lowest-number-wins` and `/api/play/lowest-number-wins` appear in build output with no errors

## Current State Of The Project
- Three account types live in production: `teacher`, `student`, `player` (see `conventions.md` → Account Types)
- The global site shell now uses full-page width instead of the older narrow 1180px cap, while still keeping responsive outer padding
- The `/play` page now collapses the top class-management block behind a `Classes` disclosure, and it re-opens automatically after join success/error feedback
- Teacher workspace and student arcade are both active, real surfaces; class creation defaults to no-curriculum; curriculum opt-in
- Arcade supports both `student` (class required) and `player` (class optional) entry paths
- Integer Practice is a large adaptive system with its own progression engine and Node tests
- Double Board supports integer operations, percent-change multipliers, and Mixed Review, with a live classroom flow that now includes turn reordering, student-voted settings, per-student lockouts in free-for-all, roster presence colors, synced one-at-a-time phase timers, teacher next-student control, podium end-state, and the new full-width status row
- Double Board production already has server-synced countdown/claim timers, in-modal timer display, explicit modal close, live presence-based in-room tracking, faster live polling, updated board-progress scoring, and a projector-friendly fullscreen mode with reduced top chrome
- Saved-state for Integer Practice and 2048 now lives in the `saved_game_progress` DB table; auth-metadata fallback remains for existing users until their next save
- Local dev boots on `.env.local`; staging uses `.env.staging.local` and the `staging` branch, with a separate Supabase project; `Production` and `Preview` Vercel scopes map to the corresponding Supabase projects
- Admin has a "Clear saved game progress" control on the User Information page; now clears from DB and legacy auth metadata
- Root `README.md` has been replaced with a project-specific overview pointing at `/brain/START_HERE.md`

## Active Tasks
- None in progress.

## Next Recommended Steps
Prune completed items from this list when rewriting this file. Order is rough priority.

1. **Run `migrations_20260426_lowest_number_wins.sql` in Supabase** — must be applied before the game works with real data. The 3 tables (`lowest_number_wins_sessions`, `lowest_number_wins_players`, `lowest_number_wins_picks`) and their RLS policies are all in this migration.
2. **Merge Lowest Number Wins branch → main** — the work is on `claude/upbeat-wescoff-7a8bdc`; create a PR and merge to ship.
3. **Re-implement cross-user profile visibility via security definer functions** — The 3 complex profiles policies (classmates readable, co-teacher reads class members, teacher reads class members) and `courses: co-teacher read` all cause Postgres "infinite recursion detected in policy" errors. Fix: wrap the subquery logic in `security definer` functions. This is the most important remaining security hardening item.
4. Rotate the staging `SUPABASE_SERVICE_ROLE_KEY` — it was pasted into chat during staging bootstrap and should be considered compromised
5. Confirm the `staging` branch preview URL resolves, then attach `staging.mathclaw.com` to it and add `https://staging.mathclaw.com/auth/callback` in the staging Supabase auth settings
6. Merge PR `claude/laughing-mayer-0b46ce` → main to ship the stale-poll modal fix
7. Visual pass on `/play/double-board` in fullscreen/projector width
8. Playtest Double Board on teacher and student devices
9. Visual pass on `/play/integer-practice` for wide/narrow number line rendering

## Key Files To Load Next Time
Default startup path (keep minimal):
- `/Users/zackarenstein/mathclaw-next/brain/START_HERE.md`
- `/Users/zackarenstein/mathclaw-next/brain/project_overview.md`
- `/Users/zackarenstein/mathclaw-next/brain/architecture.md`
- `/Users/zackarenstein/mathclaw-next/brain/conventions.md`
- `/Users/zackarenstein/mathclaw-next/brain/file_map.md`
- `/Users/zackarenstein/mathclaw-next/brain/session_handoff.md`
- Then the relevant `/brain/feature_context/*.md` files for the task

Load only when scope requires:
- `/Users/zackarenstein/mathclaw-next/CHATGPT_CONTEXT.md` — off-repo context snapshot
- `/Users/zackarenstein/mathclaw-next/brain/history.md` — past sessions, only when tracing timelines
- `/Users/zackarenstein/mathclaw-next/brain/features.md` — broad catalog, reference-only
- `/Users/zackarenstein/mathclaw-next/brain/current_priorities.md` — broad roadmap, reference-only

Per-task file maps live in `file_map.md` and the feature_context files. Do not accumulate per-task file lists in this handoff — add them to `file_map.md` or the relevant feature_context file instead.

## Known Issues / Bugs
- **RLS cross-user profile policies not live** — The following policies were dropped from production because they cause Postgres infinite recursion (via `student_course_memberships` RLS → `courses` RLS cycle): `profiles: classmates readable`, `profiles: co-teacher reads class members`, `profiles: teacher reads class members`, `courses: co-teacher read`, `courses: enrolled student read`. All existing app paths that need this access already use the admin client or security definer RPCs, so no user-facing feature is broken. The fix is to rewrite these as `security definer` functions. See Next Recommended Steps #1.
- **`course_members` table created in production** — it exists now (created from schema.sql definition) but is empty; no co-teacher assignments have been made. All migrations from the audit session have been applied to production.
- **Account type metadata**: legacy teacher accounts can be missing `account_type` in auth metadata. Teacher-only gates must use an explicit teacher check *and* tolerate legacy profiles via fallbacks. Never treat "non-student" as "teacher" now that `player` exists.
- **Saved-state fallback**: auth-metadata fallback for old `saved_games.*` entries remains active in both page.js files. It can be removed once all active users have re-saved (or after a cleanup script). Not urgent.
- **Middleware convention**: still `middleware.js`; Next 16 warns about the newer `proxy` convention.
- **Lint**: pre-existing unrelated failures in `app/admin/page.js` (`Date.now()` during render) and `app/play/comet-typing/game-client.js` (hook dependency warning, unescaped apostrophe).
- **Vercel dashboard** can intermittently fail to render Deployments view even when the live app is healthy. Check the deployed URL directly before assuming an outage. Corrected env vars do not take effect until a fresh deployment is created — a deploy hook is a reliable path when the dashboard is flaky.
- **Supabase SQL editor paste limit** is unreliable for the large curriculum seed. Prefer the terminal-side upload helpers under `scripts/`.

## Notes For Future AI Sessions
- Do not touch `/Users/zackarenstein/mathclaw-next/supabase/migrations_20260331_join_course_by_code_rpc.sql` unless explicitly asked
- Production schema may be older than the repo in places — keep fallback logic intact
- Owner access is controlled by `MATHCLAW_OWNER_EMAILS`
- Keep edits modular; load only the feature files needed for the task
- Default delivery assumption: fix/build/change requests go live on the site unless the user explicitly says otherwise (see `conventions.md` → Delivery Convention)
- Canonical role spec lives in `conventions.md` → Account Types. Update that one place, not multiple files, when role behavior changes.
