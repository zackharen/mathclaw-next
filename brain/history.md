# Session History

Append-only log of past session accomplishments and lightweight attention-allocation signals.

New sessions should *not* load this file by default. `session_handoff.md` holds the current state; this file is here only when someone needs to trace when or why something shipped, or to reason about which parts of the product have been getting attention versus neglect.

At the end of a session, move the prior session's "What Was Built" entries here, grouped under a dated heading, and leave `session_handoff.md` describing only the current session.

Each dated entry should also include a short `Attention Allocation` block when possible. Keep it rough and cheap to maintain:
- Use product-area names such as `Double Board`, `Integer Practice`, `Teacher Workspace`, `Student Arcade Shell`, `Auth/Onboarding`, `Admin`, `Brain/Docs`, `Infra/Deploy`, or another obvious surface
- Mark effort as `heavy`, `medium`, or `light`
- Add a few words of context when helpful, such as `shipped`, `polish`, `bugfix`, `investigation`, `docs`, or `deployment`
- This is not a timesheet; it is only a directional signal so future sessions can answer questions like "what have we been neglecting?"

---

## 2026-04-24

- Applied the security-audit production migrations with prerequisite fixes for missing `account_type`, `discoverable`, and `course_members` schema pieces
- Backfilled student/player profiles that had inherited the teacher default
- Enabled production RLS for `profiles` and `courses` with a reduced safe policy set; complex cross-user visibility policies still needed security-definer follow-up

### Attention Allocation
- `Infra/Deploy` — `heavy` — production migration and RLS work
- `Auth/Onboarding` — `medium` — profile account-type backfill

## 2026-04-23 (session 4 — security audit)

- Full read-only security and quality audit (Phase 1) followed by execution of all findings (Phase 2)
- Deleted stale unauthenticated admin repair route (`app/api/admin/repair-integer-practice/route.js`)
- Fixed admin password input: changed `type="text"` → `type="password"` on temp-password field in `app/admin/page.js`
- Fixed `ensureProfileForUser` ambiguous error-matching: narrowed condition to only retry without `account_type` on Postgres `42703` (undefined column), not on check-constraint violations (`23514`), preventing new player accounts from receiving the 'teacher' DB default
- Added teacher-type gate to `joinClassByCodeAction` in `app/play/actions.js` so teachers cannot join classes as student members
- Tightened Connect4 RLS update policy to enforce turn order at DB level (`current_turn_id = auth.uid() and status = 'active'`); switched Connect4 rematch action to use admin client so finished-match resets aren't blocked by the new policy
- Added per-game score ceiling clamping to `POST /api/play/session` to limit leaderboard score tampering
- Created 4 migration files:
  - `supabase/migrations_20260423_player_account_type.sql` — adds 'player' to `profiles.account_type` check constraint + backfill
  - `supabase/migrations_20260423_connect4_rls_tighten.sql` — tighter Connect4 update policy
  - `supabase/migrations_20260423_profiles_courses_rls.sql` — enables RLS on `profiles` and `courses` with full scoped policy set
  - `supabase/migrations_20260423_rls_intent_docs.sql` — documents intentional no-SELECT policy on `bug_reports`/`internal_event_logs`

### Attention Allocation
- `Auth/Onboarding` — `medium` — bugfix (player account type constraint + error-matching)
- `Admin` — `light` — security fix (password input type, deleted repair route)
- `Infra/Deploy` — `heavy` — security (RLS on profiles/courses, score clamping, Connect4 RLS tighten)

## 2026-04-23 (session 3)

- Diagnosed and fixed the Double Board bug where students were kicked out of the answer modal immediately after clicking a tile
- Root cause: background polls in-flight before `claim_question` returned stale board data (no claim), causing the modal-close `useEffect` to fire and dismiss the modal — affects both `free_for_all` (claim check) and `one_at_a_time` (activeQuestionId check) modes
- Fix: added `modalOpenRef` (useRef) synced to `selectedQuestion`; quiet background polls skip `setSession` while the modal is open, so stale poll data can't overwrite valid claim state
- Committed as `042ccf4` on `claude/laughing-mayer-0b46ce`, pushed, PR opened against main

### Attention Allocation
- `Double Board` — `medium` — bugfix (stale-poll race condition, both play modes)

## 2026-04-23 (session 2)

- Added "Turn advances" toggle to Double Board one-at-a-time mode: "Keep going until wrong" (default, existing behavior) vs. "One question per turn" (turn moves after any answer)
- Toggle appears in Game Setup only when One at a time is selected; setting is stored in session metadata, synced to all clients, and the live-game description text updates to match
- Pushed to `main` as commit `4861855`

### Attention Allocation
- `Double Board` — `medium` — new feature (turn advance mode toggle)

## 2026-04-23 (session 1)

- Polished the Double Board teacher/projector view by moving the answer-modal `X` button to the right, stopping the host `Game setup` panel from auto-reopening during live polling, and hiding the top explainer/chrome in fullscreen behind a minimal `Exit Fullscreen` bar
- Promoted the Double Board teacher-view fullscreen/UI polish to `main` with production commit `e688cd2`

### Attention Allocation
- `Double Board` — `heavy` — shipped teacher/projector polish and production promotion
- `Infra/Deploy` — `light` — production release follow-through

## 2026-04-22

- Fixed Double Board countdown and claim-timer rendering so teacher and student views stay aligned instead of showing inflated countdown values before start or during short claim windows
- Added the active claim timer inside the Double Board answer modal and highlighted claimed tiles with a yellow engaged state so students can track live questions more clearly
- Updated the Double Board answer modal so clicking outside it no longer exits the question; students now leave through an explicit `X` button in the top-left corner
- Fixed one-at-a-time mode so the active student can click any open tile on their turn instead of being blocked by an unnecessary client-side single-tile restriction
- Updated Double Board scoring so tile values and awarded points now use miss-based doubling plus `+1` for each already-solved question on the board
- Added live presence tracking for Double Board so the in-room student list reflects open tabs rather than historical joins, and one-at-a-time turn order now ignores disconnected students
- Tightened live-game polling to make claim-state updates appear faster without changing the slower waiting-room refresh cadence
- Promoted the Double Board classroom-flow fixes to `main` with production commit `264cf9d`
- Followed up with a server-synced Double Board timer fix so countdowns and claim timers no longer depend on each device’s local clock; this also reduces false “correct answer didn’t register” cases caused by client/server timer drift
- Updated Double Board solved-tile scoring display so solved questions keep the point value they were worth when answered, while only unsolved questions continue to climb as the board progresses
- Promoted the Double Board timer-sync follow-up to `main` with production commit `d2ea365`

### Attention Allocation
- `Double Board` — `heavy` — live classroom flow, timer sync, scoring, polling, and UI fixes
- `Infra/Deploy` — `light` — production promotions

## 2026-04-21

- Moved saved game state (Integer Practice, 2048) from auth metadata to a new `saved_game_progress` Postgres table — fixes HTTP 431 bug caused by large payloads inflating session cookies
- `save-state` POST upserts to DB; DELETE removes from DB; page.js for both games reads DB first with auth-metadata fallback (zero data loss for existing users)
- Admin clear action now deletes from DB and also cleans up legacy auth metadata; admin page merges DB slugs with auth metadata for display
- Migration run on production Supabase (commit `b5ebcc5` on `main`)

- Made the `/play` class area collapsible under a `Classes` toggle while keeping the join form and joined-class list inside; the panel auto-opens when join feedback is present so success/error states are visible
- Removed the top-level 1180px site-width cap in `app/globals.css` so the global shell can expand to the full page width with responsive side gutters; verified with `npm run build`
- Promoted the arcade-player / optional-curriculum-class release to both `staging` and `main`; verified the live production sign-up page is serving the three-account chooser with the `Arcade Player` option (commit `9074531` on `main`)
- Added a third account type, `player` ("Arcade Player"), for adults/independent users who land in `/play` without a teacher workspace or a required class
- Tightened teacher-only gates to require an explicit `teacher` account type rather than treating every non-student account as a teacher
- Class creation now defaults to a no-curriculum arcade/general class; curriculum is opt-in
- Co-teacher/class-owner selection still tolerates legacy teacher accounts missing `account_type` metadata
- Verified with `npm run build`; `npm run lint` still reports the same pre-existing unrelated issues in `app/admin/page.js` and `app/play/comet-typing/game-client.js`
- Restructured `/brain/`: Extracted historical session entries into new `/brain/history.md`; made `conventions.md` → Account Types the canonical three-role spec; updated `project_overview.md`, `architecture.md`, `file_map.md`, `feature_context/INDEX.md`, `auth_and_onboarding.md`, `teacher_workspace.md`, `student_arcade_shell.md`, and `START_HERE.md` to reference it instead of redefining roles
- Moved saved game state (Integer Practice, 2048) from auth metadata to a new `saved_game_progress` Postgres table; added auth-metadata fallback for existing users (zero data loss); updated admin clear action and admin page display; ran migration on production (commit `b5ebcc5` on `main`)

### Attention Allocation
- `Auth/Onboarding` — `heavy` — three-role rollout and role-gating changes
- `Student Arcade Shell` — `medium` — class-panel UX and arcade-player flow
- `Teacher Workspace` — `medium` — curriculum-optional class creation and teacher gating impacts
- `Integer Practice` — `medium` — saved-progress migration and fallback
- `Arcade Skill Games` — `light` — 2048 saved-progress migration
- `Admin` — `light` — saved-progress clear tooling
- `Brain/Docs` — `medium` — modular brain restructure and canonical role docs
- `Infra/Deploy` — `medium` — staging/main promotion and production verification

## 2026-04-21 — Arcade Player account type and curriculum-optional classes
- Promoted the arcade-player / optional-curriculum-class release to both `staging` and `main`, then verified the live production sign-up page is serving the new three-account chooser with the `Arcade Player` option
- Added a third account type, `player`, surfaced in the UI as "Arcade Player," for adults/independent users who should land in `/play` and use the arcade without teacher-workspace access or a required class
- Tightened role handling so teacher-only navigation and pages now require an explicit teacher account instead of treating every non-student account as a teacher
- Updated sign-up, onboarding, home, and arcade copy so arcade-only users can create an account, skip school/class requirements where appropriate, and understand that joining a class later is optional
- Changed class creation so the default flow is an arcade/general no-curriculum class, with curriculum remaining optional rather than the assumed/default path
- Updated class-owner/co-teacher selection to keep using real teacher accounts only while still tolerating legacy teacher accounts missing auth metadata
- Verified the account/class changes with `npm run build` from `/Users/zackarenstein/mathclaw-next`; `npm run lint` still reports the same pre-existing unrelated issues in `app/admin/page.js` and `app/play/comet-typing/game-client.js`
- Production commit on `main`: `9074531`

### Attention Allocation
- `Auth/Onboarding` — `heavy` — arcade-player account type and signup/onboarding behavior
- `Student Arcade Shell` — `medium` — player entry into `/play`
- `Teacher Workspace` — `medium` — curriculum-optional classes and ownership handling
- `Infra/Deploy` — `light` — build verification and production promotion

## Earlier — Brain system and project docs
- Added a root-level `CHATGPT_CONTEXT.md` file designed to be easy to upload into ChatGPT so off-repo conversations can start with a concise, high-signal project snapshot
- Added a modular `/brain` knowledge system for MathClaw
- Documented product overview, architecture, conventions, features, current priorities, and file map
- Added per-feature context files for major teacher systems and student games
- Added a reusable startup prompt for future AI chats
- Added a single-file brain entrypoint at `/brain/START_HERE.md` so future chat prompts can stay short and stable
- Added `/brain/feature_context/INDEX.md` so future sessions can pick the smallest relevant feature docs faster
- Marked broad overview docs as reference-only so they do not compete with the minimal startup path
- Replaced the root `README.md` boilerplate with a project-specific overview that points to the brain entrypoint
- Added a workflow convention for the `USH` command
- Updated the MathClaw brain instructions so future "fix/change/build this" requests default to completing the production/live-site path unless the user explicitly says otherwise

### Attention Allocation
- `Brain/Docs` — `heavy` — brain system, structure, and reusable workflow documentation

## Earlier — Double Board iteration
- Adjusted Double Board tile layout so solved/missed markers no longer sit on top of the math text, and narrowed the center column to give board questions more horizontal room
- Further refined Double Board so background polling no longer surfaces raw "Failed to fetch" banners from quiet refreshes
- Restructured Double Board solved-tile markup/CSS so answers, checkmarks, and value badges stack cleanly without overlap
- Widened the Double Board board columns again and tightened the center column so more expressions stay on one line
- Updated Double Board review and answer-history cards to render expressions/answers through the shared math display components with layout that preserves readable equations
- Reworked Double Board into a percent-change multiplier version so prompts now look like `8%↑` / `23%↓` and students answer with multipliers such as `1.08` / `0.77`
- Updated Double Board generation rules so each board keeps 12 tiles with paired increase/decrease columns, a Row 3 tens-pair from Row 2, and a mixed random third column
- Kept the existing Double Board database schema intact by storing multiplier answers as scaled hundredths plus metadata, so the new version runs locally without a schema migration first
- Updated Double Board again so the setup dropdown now lets teachers choose between the original integer-operation board and the new percent-change multiplier board
- Updated Double Board host/game flow so resetting boards preserves joined players, start triggers a full-screen `3 2 1` countdown, free-for-all tiles can be claimed with a teacher-set timer, and claim state shows the student first name plus time left on the tile
- Updated Double Board scoring so tile values now visibly include difficulty bonuses: integer-operation questions gain +1 per negative operand and percent-change decrease tiles gain +1
- Updated Double Board center-column/history styling so the action buttons are centered, score-card labels are centered/capitalized/tighter, and answer-history cards now color correct attempts green and incorrect attempts red
- Promoted the Double Board live-game-flow update to both `staging` and `main`, then pushed `main` to GitHub so production could deploy the new countdown / claim-timer / scoring / UI-polish changes (production commit: `6d189ba`)

### Attention Allocation
- `Double Board` — `heavy` — game design, live flow, scoring, and UI iteration
- `Infra/Deploy` — `light` — staging/main promotion

## Earlier — Integer Practice rebuild
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

### Attention Allocation
- `Integer Practice` — `heavy` — progression engine, UI, and remediation tuning

## Earlier — Admin and saved-state recovery
- Added an admin-side per-account "Clear saved game progress" control on the User Information page so saved Integer Practice progress can be reset without editing metadata manually
- Traced the localhost `HTTP 431` login failure to oversized Supabase auth metadata from `saved_games.integer_practice`, then cleared the bloated payload on affected accounts so local sign-in works again

### Attention Allocation
- `Admin` — `medium` — recovery tooling
- `Integer Practice` — `medium` — saved-state recovery
- `Auth/Onboarding` — `light` — login failure diagnosis

## Earlier — Environments and deployment
- Set up local MathClaw development env guidance and created a local `.env.local` with the current Supabase project values so the app can boot on `http://localhost:3000`
- Expanded auth setup docs to cover local, staging, and production environment URLs plus the full required env var set
- Added a dedicated staging workflow doc describing the recommended `feature/* -> staging -> main` promotion path with a fixed staging domain and separate staging Supabase project
- Verified direct terminal-side Supabase access to the main MathClaw project from this machine using the existing local env setup
- Added a local staging env file and verified direct terminal-side Supabase access to the staging Supabase project
- Added local helper scripts to build and upload staging curriculum data directly, then repaired the staging curriculum import outside the Supabase SQL editor
- Created and pushed a dedicated `staging` branch to GitHub for the MathClaw repo
- Triggered a Vercel preview build for the `staging` branch with an empty commit because the dashboard was failing to render the Deployments view reliably
- Walked through a real Vercel production/staging recovery after the live site had been pointed at the wrong Supabase/Vercel combination, restored the correct Vercel env split, and re-fired production successfully via a deploy hook
- Updated deployment docs with an explicit mapping between Vercel `Production` vs `Preview` env scopes and the production vs staging Supabase projects, plus a short recovery checklist

### Attention Allocation
- `Infra/Deploy` — `heavy` — local/staging/prod environment setup, recovery, and deployment workflow
- `Brain/Docs` — `light` — deployment documentation
