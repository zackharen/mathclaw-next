# Session Handoff

Read this file FIRST in future AI sessions before doing any work.
Update this file at the end of each work session.

## Last Updated
2026-04-21 America/New_York

## What Was Built
- Added a modular `/brain` knowledge system for MathClaw
- Documented product overview, architecture, conventions, features, current priorities, and file map
- Added per-feature context files for major teacher systems and student games
- Added a reusable startup prompt for future AI chats
- Added a single-file brain entrypoint at `/Users/zackarenstein/mathclaw-next/brain/START_HERE.md` so future chat prompts can stay short and stable
- Added `/Users/zackarenstein/mathclaw-next/brain/feature_context/INDEX.md` so future sessions can pick the smallest relevant feature docs faster
- Marked broad overview docs as reference-only so they do not compete with the minimal startup path
- Replaced the root `README.md` boilerplate with a project-specific overview that points to the brain entrypoint
- Added a workflow convention for the `USH` command
- Adjusted Double Board tile layout so solved/missed markers no longer sit on top of the math text, and narrowed the center column to give board questions more horizontal room
- Further refined Double Board so background polling no longer surfaces raw "Failed to fetch" banners from quiet refreshes
- Restructured Double Board solved-tile markup/CSS so answers, checkmarks, and value badges stack cleanly without overlap
- Widened the Double Board board columns again and tightened the center column so more expressions stay on one line
- Updated Double Board review and answer-history cards to render expressions/answers through the shared math display components with layout that preserves readable equations
- Updated the MathClaw brain instructions so future “fix/change/build this” requests default to completing the production/live-site path unless the user explicitly says otherwise
- Updated Double Board and Integer Practice so negative answers render without parentheses while expressions still keep parentheses where they clarify signed operations
- Updated Integer Practice timer behavior so timeout no longer auto-submits a wrong answer or repeatedly drops levels; the question stays answerable and the timer restarts on the next problem
- Updated Integer Practice remediation/accommodation scaffolds so timer pressure turns off and the timer pill hides while support mode is active
- Updated Integer Practice mastery bar so progress now tracks the 40-level ladder directly at 2.5% per level
- Updated Integer Practice number-line styling so ticks stay on one row and render over a true horizontal baseline instead of appearing as dashes only
- Reworked Integer Practice progression into a weighted readiness model with hard fails, tier thresholds, minimum attempts, weak-skill blocking, focus fallback handling, and richer student-facing feedback/readiness output
- Added a dedicated `lib/integer-practice/progression.js` evaluator plus Node-based progression tests covering level-up, hard-fail, weak-skill, insufficient-attempt, fallback, tier-threshold, hint-heavy, and borderline cases
- Updated Integer Practice UI to show a compact level-readiness card, blocked-reason feedback, recommended practice tags, and session summary readiness details
- Adjusted Integer Practice so stale older account history no longer weak-skill blocks promotion on a new strong current-level run when current-level evidence for that subskill is sparse
- Stopped Integer Practice remediation mode from auto-opening hints on each new question, which had been inflating hint-rate and could keep certain accounts artificially stuck
- Added an admin-side per-account “Clear saved game progress” control on the User Information page so saved Integer Practice progress can be reset without editing metadata manually
- Set up local MathClaw development env guidance and created a local `.env.local` with the current Supabase project values so the app can boot on `http://localhost:3000`
- Expanded auth setup docs to cover local, staging, and production environment URLs plus the full required env var set
- Added a dedicated staging workflow doc describing the recommended `feature/* -> staging -> main` promotion path with a fixed staging domain and separate staging Supabase project
- Reworked Double Board into a percent-change multiplier version so prompts now look like `8%↑` / `23%↓` and students answer with multipliers such as `1.08` / `0.77`
- Updated Double Board generation rules so each board keeps 12 tiles with paired increase/decrease columns, a Row 3 tens-pair from Row 2, and a mixed random third column
- Kept the existing Double Board database schema intact by storing multiplier answers as scaled hundredths plus metadata, so the new version runs locally without a schema migration first

## Current State Of The Project
- Teacher workspace and student arcade are both active, real surfaces in production-oriented code
- Student arcade includes many standalone game routes plus live classroom play
- Integer Practice recently grew into a large adaptive system
- Saved-state and auth/session behavior have required recent fixes
- Temporary admin repair tooling exists for the Integer Practice auth-metadata issue
- Double Board has another round of layout/readability fixes applied; a browser check would still be useful for projector/fullscreen confirmation
- Integer answer formatting is now split more intentionally between expression display and answer display
- Integer Practice timeout now freezes on the current question instead of auto-marking it wrong; remediation mode also disables the visible timer
- Integer Practice mastery progress now reflects ladder position directly rather than a blended fluency score
- Integer Practice number line now stays in a single horizontal row with a visible center line, using horizontal scrolling if the span is too wide
- Integer Practice progression now evaluates current-level evidence with weighted scoring instead of an all-metrics-must-pass gate, while still preserving adaptive support and fallback demotion behavior
- Integer Practice now exposes readable readiness state, progression score, blocked reasons, and recommended practice tags to the UI and session metadata
- Integer Practice timed-out questions still stay answerable at `0`, and their response time is capped so they retain progression value instead of becoming a dead question
- Admins can now clear `saved_games` entries like `integer_practice` or `2048` from an account on `/admin`, which should help recover from stuck per-account saved progress
- Local development now boots once `.env.local` is present; current repo docs explicitly describe the required Supabase env values and auth callback URLs
- The repo now documents a recommended staging environment setup using a fixed `staging.mathclaw.com` domain, separate staging Supabase project, and `staging` branch promotion flow
- Double Board now runs as a percent-change multiplier game instead of the earlier integer-operation version, while preserving the same live host/join/score flow
- Double Board answer parsing/display now supports decimal multipliers like `1.08` and `0.92`, including answer history, review cards, and solved-tile rendering

## Active Tasks
- None in progress inside this session after the `/brain` setup
- None in progress after the Integer Practice timer/progress/number-line fixes
- None in progress after the Integer Practice progression/readiness refactor
- None in progress after the local env/bootstrap and staging workflow documentation pass
- None in progress after the Double Board percent-change multiplier rebuild
- Follow-up cleanup likely needed:
  - remove temporary Integer Practice recovery route after it is no longer needed
  - move richer saved progress out of auth metadata into a table-backed system
  - replace boilerplate root README
  - optionally fine-tune Double Board tile sizing on the projected classroom view after a visual check

## Next Recommended Steps
1. Remove `app/api/admin/repair-integer-practice/route.js` once recovery is confirmed complete
2. Create a proper DB-backed saved progress table for larger game state
3. Run a visual pass on `/play/double-board` in fullscreen/projector-like width to confirm the updated tile widths and history cards look right in practice
4. Continue documenting complex systems that keep changing, especially question-engine and saved-state architecture
5. Keep `/Users/zackarenstein/mathclaw-next/brain/START_HERE.md` as the canonical AI entrypoint instead of repeating longer startup instructions in every new chat
6. Run a quick browser visual pass on `/play/integer-practice` to confirm the new single-row number line feels good across wide spans and small screens
7. Playtest Integer Practice progression tuning now that thresholds, weak-skill gates, and score bands are centralized and easier to adjust
8. Create the actual `staging` branch, Vercel staging project/environment, and staging Supabase project now that the repo-side docs are in place
9. Add `https://staging.mathclaw.com/auth/callback` in the real staging Supabase auth settings once the staging domain exists
10. Playtest `/play/double-board` locally with a teacher + student flow to confirm the new percent-change prompts feel good in projector view before pushing live

## Key Files To Load Next Time
- `/Users/zackarenstein/mathclaw-next/brain/START_HERE.md`
- `/Users/zackarenstein/mathclaw-next/brain/feature_context/INDEX.md`
- `/Users/zackarenstein/mathclaw-next/brain/project_overview.md`
- `/Users/zackarenstein/mathclaw-next/brain/architecture.md`
- `/Users/zackarenstein/mathclaw-next/brain/conventions.md`
- `/Users/zackarenstein/mathclaw-next/brain/file_map.md`
- `/Users/zackarenstein/mathclaw-next/brain/session_handoff.md`
- Then the relevant `/Users/zackarenstein/mathclaw-next/brain/feature_context/*.md` files for the task
- For the recent Double Board UI tweak:
  - `/Users/zackarenstein/mathclaw-next/app/globals.css`
  - `/Users/zackarenstein/mathclaw-next/app/play/double-board/game-client.js`
- For the follow-up Double Board polish:
  - `/Users/zackarenstein/mathclaw-next/app/globals.css`
  - `/Users/zackarenstein/mathclaw-next/app/play/double-board/game-client.js`
  - `/Users/zackarenstein/mathclaw-next/app/api/play/double-board/route.js`
- For the percent-change Double Board version:
  - `/Users/zackarenstein/mathclaw-next/app/play/double-board/page.js`
  - `/Users/zackarenstein/mathclaw-next/app/play/double-board/game-client.js`
  - `/Users/zackarenstein/mathclaw-next/app/api/play/double-board/route.js`
  - `/Users/zackarenstein/mathclaw-next/lib/question-engine/double-board.js`
- For negative-answer formatting:
  - `/Users/zackarenstein/mathclaw-next/app/play/double-board/game-client.js`
  - `/Users/zackarenstein/mathclaw-next/app/play/integer-practice/game-client.js`
  - `/Users/zackarenstein/mathclaw-next/lib/integer-practice/engine.js`
- For the Integer Practice timer/progress/number-line follow-up:
  - `/Users/zackarenstein/mathclaw-next/app/play/integer-practice/game-client.js`
  - `/Users/zackarenstein/mathclaw-next/lib/integer-practice/engine.js`
  - `/Users/zackarenstein/mathclaw-next/app/globals.css`
- For the Integer Practice progression/readiness system:
  - `/Users/zackarenstein/mathclaw-next/lib/integer-practice/progression.js`
  - `/Users/zackarenstein/mathclaw-next/lib/integer-practice/levels.js`
  - `/Users/zackarenstein/mathclaw-next/lib/integer-practice/engine.js`
  - `/Users/zackarenstein/mathclaw-next/app/play/integer-practice/game-client.js`
  - `/Users/zackarenstein/mathclaw-next/tests/integer-progression.test.mjs`
  - `/Users/zackarenstein/mathclaw-next/lib/integer-practice/package.json`
- For the account-stuck/remediation-hint follow-up:
  - `/Users/zackarenstein/mathclaw-next/lib/integer-practice/progression.js`
  - `/Users/zackarenstein/mathclaw-next/app/play/integer-practice/game-client.js`
  - `/Users/zackarenstein/mathclaw-next/tests/integer-progression.test.mjs`
- For the admin saved-progress reset control:
  - `/Users/zackarenstein/mathclaw-next/app/admin/actions.js`
  - `/Users/zackarenstein/mathclaw-next/app/admin/page.js`
- For local/staging environment setup:
  - `/Users/zackarenstein/mathclaw-next/README.md`
  - `/Users/zackarenstein/mathclaw-next/docs/auth-setup.md`
  - `/Users/zackarenstein/mathclaw-next/docs/staging-workflow.md`
  - `/Users/zackarenstein/mathclaw-next/.env.example`

## Known Issues / Bugs
- Middleware file convention should likely move from `middleware.js` to `proxy` eventually
- Auth metadata must stay small; large saved game payloads can break headers/session cookies
- Temporary route exists:
  - `app/api/admin/repair-integer-practice/route.js`
- Repo-wide lint still has pre-existing unrelated failures in:
  - `app/admin/page.js` (`Date.now()` during render)
  - `app/play/comet-typing/game-client.js` (hook dependency warning and unescaped apostrophe)
- Integer progression tests now exist and pass via `npm test`; they use a local ESM boundary inside `lib/integer-practice/`

## Notes For Future AI Sessions
- Do not touch `/Users/zackarenstein/mathclaw-next/supabase/migrations_20260331_join_course_by_code_rpc.sql` unless explicitly asked
- Production schema may be older than the repo in places, so keep fallback logic intact
- Owner access is controlled by `MATHCLAW_OWNER_EMAILS`
- Keep edits modular and load only the feature files needed for the task
- Default assumption: if the user asks for a fix or feature and does not say otherwise, they want it made live on the site, not left as local-only or branch-only work
