# Session Handoff

Read this file FIRST in future AI sessions before doing any work.

This file represents the **current state only**. It should stay short enough to be loaded in every new session without cost. When a session ends:
1. Move the prior "What Was Built" entries to `/brain/history.md` under a dated heading.
2. Rewrite "Current State Of The Project" to reflect *now*, not a log.
3. Prune obsolete items from "Next Recommended Steps" and "Known Issues."

## Last Updated
2026-04-23 America/New_York

## What Was Built (Current Session)
- Double Board now has the full 12-feature classroom update across the recent `staging` commits: turn reordering, student settings voting, Mixed Review, free-for-all lockouts, roster presence colors, sitewide student ready banner, end-of-game podium, timed one-at-a-time keep-going turns, teacher active-question popup, fixed 4-choice multiple choice, manual Next Student control, and the new full-width status row
- The remaining unpushed `staging` work adds server-owned `turnPhase` / `turnPhaseEndsAt` / `turnQuestionId` state, synced one-at-a-time phase timers, teacher popup controls, shared multiple-choice option generation in `lib/question-engine/double-board.js`, and the new status-row / phase-card UI in Double Board
- Repo-wide lint still has unrelated pre-existing failures, but targeted Double Board syntax and ESLint checks pass

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
- Temporary Integer Practice repair route (`app/api/admin/repair-integer-practice/route.js`) still exists — now safe to remove
- Root `README.md` has been replaced with a project-specific overview pointing at `/brain/START_HERE.md`

## Active Tasks
- None in progress.

## Next Recommended Steps
Prune completed items from this list when rewriting this file. Order is rough priority.

1. Remove `app/api/admin/repair-integer-practice/route.js` — the saved-progress migration is done; this repair route is no longer needed
2. Rotate the staging `SUPABASE_SERVICE_ROLE_KEY` — it was pasted into chat during staging bootstrap and should be considered compromised
3. Confirm the `staging` branch preview URL resolves, then attach `staging.mathclaw.com` to it and add `https://staging.mathclaw.com/auth/callback` in the staging Supabase auth settings
4. Visual pass on `/play/double-board` in fullscreen/projector width to confirm the new full-width status row, teacher popup, podium modal, and phase-card timing all feel strong in class use
5. Playtest Double Board on teacher and student devices with a short `5` or `10` second timer to verify synced select/answer phases, manual next-student, student voting resolution, roster colors, free-for-all lockouts, and Mixed Review question variety under real classroom conditions
6. Visual pass on `/play/integer-practice` to confirm the single-row number line renders well across wide and narrow screens
7. Playtest Integer Practice progression tuning now that thresholds, weak-skill gates, and score bands are centralized
8. Continue documenting systems that keep changing — question-engine, saved-state, and showdown framework are the next likely candidates for dedicated brain files

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
- **Account type metadata**: legacy teacher accounts can be missing `account_type` in auth metadata. Teacher-only gates must use an explicit teacher check *and* tolerate legacy profiles via fallbacks. Never treat "non-student" as "teacher" now that `player` exists.
- **Saved-state fallback**: auth-metadata fallback for old `saved_games.*` entries remains active in both page.js files. It can be removed once all active users have re-saved (or after a cleanup script). Not urgent.
- **Temporary admin repair route** exists: `app/api/admin/repair-integer-practice/route.js`. Now safe to remove.
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
