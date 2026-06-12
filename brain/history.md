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

## 2026-04-26

- Built **Lowest Number Wins** — new live classroom game at `/play/lowest-number-wins`
- Students each pick a number > 0 (natural numbers or positive decimals per session setting); whoever picks the lowest number no one else picked wins; draw if no unique number exists
- Multiple rounds per session; teacher controls Start Round / Reveal / Next Round / End Session; picks hidden until reveal; full per-name breakdown shown on reveal
- Projector/fullscreen mode: live submission counter during picking, large winner announcement on reveal
- Historical data: per-player `total_wins`, `game_sessions` rows on session end
- Files: `app/api/play/lowest-number-wins/route.js`, `app/play/lowest-number-wins/page.js` + `game-client.js`, `supabase/migrations_20260426_lowest_number_wins.sql`, `brain/feature_context/lowest_number_wins.md`, catalog entry, CSS
- Merged `locker-practice-safe-deploy` → `main` and pushed; Vercel deploy triggered
- Migration `migrations_20260426_lowest_number_wins.sql` still needs to be run in production Supabase before the game works

### Attention Allocation
- `Lowest Number Wins` — `heavy` — shipped (new feature, full stack)
- `Infra/Deploy` — `medium` — merged locker-practice-safe-deploy + LNW into main, pushed to production

## 2026-04-28

- Fixed `/teachers` page showing student and soft-deleted accounts: added `.eq("account_type", "teacher")` filter and cross-referenced against `auth.admin.listUsers` to exclude `app_metadata.account_deleted = true` rows
- Ran SQL to clean orphaned profile rows (profiles with no matching auth user): set `discoverable = false` for all such rows
- Alphabetized nav items for teacher and student/player navs; Log Out stays hardcoded last
- Committed `app/components/GameReadyBanner.js` which was untracked and silently breaking all Vercel production builds
- Reverted invalid `eslint.ignoreDuringBuilds` key from `next.config.mjs` (not supported in Next.js 16)
- Simplified homepage: stripped all user-type-specific sections; replaced with a single `homeWelcome` heading (editable from admin site copy panel, default "Welcome to Mathclaw!")
- Added MathClaw square logo (`public/mathclaw-logo.png`) to the homepage
- Replaced nav brand text with horizontal MathClaw logo image (`public/mathclaw-logo-nav.png`) — acts as home button, scales responsively by height
- Iterated nav logo twice (transparent background, then wider/tighter-crop version) based on user feedback
- Fixed Vercel build failure caused by `lib/integer-practice/mastery-settings.js` and `mastery-settings.server.js` being untracked and never committed

### Attention Allocation
- `Homepage` — `heavy` — redesign (cleared content, added logo, welcome heading, admin-editable copy)
- `Nav/Shell` — `medium` — logo replaces brand text, iterated to final version
- `Teachers Page` — `medium` — bugfix (account_type filter, soft-deleted exclusion)
- `Infra/Deploy` — `medium` — fixed broken Vercel builds (untracked component + missing lib files)
- `Brain/Docs` — `light` — session handoff update

## 2026-04-27

- Preserved the prior dirty `staging` worktree in stash, created clean `locker-practice-safe-deploy` branch
- Re-applied only the deployable Locker Practice work: new `/play/locker-practice` route, arcade catalog/route/session integration, and Locker-only global styles
- Fixed Locker Practice dial behavior: rotating dial face matches the validated current number; dial numbers now rotate radially with the dial; center readout says `Number under top marker`; right/clockwise slider movement increases marker number consistently; direction validation checks committed slider direction instead of first tiny movement
- Built an owner-only Integer Mastery Dashboard in `/admin?view=diagnostics` for global Adding & Subtracting Integers level-up tuning
- Integer Practice Adaptive Practice and Level Progression now use saved global mastery settings: minimum attempts, recent window, correct-in-window, streak, blended historical/current accuracy, retry handling, hint gate, speed gate, and close buffer
- Added admin mastery simulator and Node coverage for custom recent-correct and first-try-only mastery rules

### Attention Allocation
- `Locker Practice` — `heavy` — shipped (clean deploy branch, dial bugfixes)
- `Integer Practice` — `heavy` — new feature (global mastery settings, owner dashboard, admin simulator)
- `Infra/Deploy` — `medium` — clean branch isolation, branch strategy work

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

## 2026-04-28 to 2026-04-29

- **Group activity banner** shipped (`app/layout.js`, `app/components/GameReadyBanner.js`): site-wide student banner detects active Double Board, LNW, and Open Middle sessions via teacher presence, hides on those game routes, uses most-recent presence when multiple games are active.
- **Double Board timing and UI fixes** (`app/play/double-board/game-client.js`, `app/api/play/double-board/route.js`): countdown no longer restarts every poll; timer seeds from `serverNowMs`; multiple choice options memoized per question id; student vote results stored without changing live settings; teacher "Your Score" stat card removed; expressions hidden during start countdown.
- **Double Board one-at-a-time timer hotfix**: turn expiry refetches latest metadata before advancing; eligible turn list built from full enrolled roster + joined students; start countdown fix so first student gets full timer.
- **Double Board classroom flow** (commit `6310ce2`): 3-second countdown, persistent turn reordering, Next Student throughout live play, Keep Going Until Wrong turn state reset, free-for-all purple lockout, one-at-a-time active question as centered modal, unclaim server action (one unclaim per turn).
- **LNW improvements**: session payload includes per-student submission status; teacher and projector views show roster with red/green submitted indicators; projector includes teacher controls (Start Round, Reveal, Next Round, End Session).
- **Admin rollout controls** shipped (commit `4c46cda`): grouped AdminDisclosure stack for Feature Controls and Bulk Update; alphabetical/status sort; shortened rollout labels; navy shade status chips; editable Admin copy fields via Edit Site Text.
- **USHM command** added to brain docs: push all local changes live, merge to main, deploy, update handoff.
- **Claude Code settings.json** created at repo root (`.claude/settings.json`): auto-approves Read/Edit/npm/basic git; blocks push, force-reset, Supabase db push/reset, Vercel deploy, rm -rf, sudo.
- **Admin defaults and collapsible sections**: `/admin` defaults to Bugs and Internal Errors for owner/admin; Diagnostics and Accounts sections all start collapsed; Traffic & App Usage renamed (removes old App Decision panel); Internal Error Log shows display name, two-column grid, 5-week recent window, archive; Bug Reports pluralized, auto-opens, two-column grid, resolved archive.
- **Admin Sections switcher** shipped: five alphabetized views (Bugs, Editable Site Copy, Feature Rollout, Mastery Settings, User Information), each with `?view=` route.
- **Mastery Settings view** (`/admin?view=mastery`): Integer Mastery Dashboard moved from diagnostics and reframed as cross-game setting.
- **School Snapshot** moved inside `accounts` view.
- **Header chip** shipped: Player Mode, Student Mode, Teacher Mode, Admin Mode; navy shade variants in `app/globals.css`.
- **Auth metadata cleanup** shipped: `removeLegacySavedGamesFromMetadata` strips legacy `saved_games` on every sign-in and OAuth callback.

### Attention Allocation
- `Double Board` — `heavy` — live classroom flow, timer sync, UI polish, multiple sessions
- `LNW` — `medium` — teacher/projector roster, submission status
- `Admin` — `heavy` — sections switcher, rollout controls, editable copy, layout, defaults, mastery view
- `Student Arcade Shell` — `light` — ArcadeDisclosure grouping
- `Brain/Docs` — `medium` — LU command, USHM command, Claude Code settings
- `Infra/Deploy` — `medium` — multiple production commits, auth metadata cleanup

## 2026-04-29 (Afternoon)

- **Admin UI polish** shipped (`app/admin/page.js`, `app/globals.css`): new `AdminInnerDisclosure` component for nested collapsible sections without outer card wrapper; Diagnostics and Accounts groups wrapped in plain `<div>` to collapse inter-section gaps (grouped disclosure stack pattern).
- **Hydration error fixed**: `AdminDisclosure` description changed from `<p>` to `<span class="adminSectionDesc">` and `AdminInnerDisclosure` summary uses bare `<h3>`, eliminating invalid HTML that caused browser auto-close and SSR/React tree mismatch.
- CSS: `.adminSectionSummary p` → `.adminSectionDesc`; `.adminInnerSectionDetails` margin-top; `adminSectionSummary h3/h4` margin reset.

### Attention Allocation
- `Admin` — `medium` — hydration bugfix, grouped disclosure polish

## 2026-05-02

- **Admin User Information UI cleanup** shipped (`app/admin/page.js`, `app/admin/actions.js`, `app/globals.css`): Search and Bulk Action are two separate titled cards in a shared `.adminCardGroup`; account list rows joined in their own `.adminCardGroup` with dividers; checkboxes moved inside card border; Apply Filters/Clear buttons in row below fields; Deleted Accounts in footer row; class summary text simplified; after-delete redirect preserves open user card.

### Attention Allocation
- `Admin` — `medium` — User Information UI cleanup

## 2026-05-04

- **7 Double Board + LNW fixes shipped** (commit `11214d5`): `clockOffsetRef` timer fix eliminates stutter and countdown shows 3→2→1; multiple choice for students via `serializeQuestion` answerMode param; wrong-answer turn advancement captures `advanceTurn` return value immediately; 1200ms modal dismiss debounce prevents poll state from kicking students mid-answer; LNW no-winner teacher credit (isTeacherWin, leaderboard badge); LNW session auto-detect resets to courseId discovery on missing session; Move To Next Game button in LNW and Double Board.
- **Brain startup docs restored**: `brain/codex_workflows.md` (Codex workflow guide), `brain/project_overview.md`, `brain/architecture.md`, `brain/file_map.md`, `brain/feature_context/INDEX.md` all restored. Startup now loads the Codex workflow guide alongside core brain files. Docs-only; no app code changed.

### Attention Allocation
- `Double Board` — `heavy` — timer, multiple choice, turn advancement, modal, Move To Next Game
- `LNW` — `medium` — no-winner teacher credit, auto-detect, Move To Next Game
- `Brain/Docs` — `light` — startup docs and Codex workflow guide restored

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

## 2026-05-05 through 2026-06-09 (entries moved verbatim from session_handoff.md on 2026-06-10)

## What Was Built (2026-06-09 Session — Profile calendar collapsible sections)

- **Profile School Calendar area split into collapsible sections** (`app/onboarding/profile/page.js`): the teacher Profile calendar card now has separate disclosure sections for **Calendar** (open by default), **Marking Periods**, and **Announcement Assignments**. This reduces scroll and keeps the marking period / assignment tools tucked away until needed.
- Verification passed locally: `node --check app/onboarding/profile/page.js`; `git diff --check`; `npm run build`.

## What Was Built (2026-06-09 Session — Grouped assignment preview class menu)

- **Announcement Assignment preview rows now group by generated date** (`app/onboarding/profile/page.js`, `app/onboarding/profile/actions.js`, `lib/announcements/assignment-rules.js`): all-class rules no longer show one full row per class. Each generated date is one row with Original, Assignment Date, MP, and a **Classes** menu.
- **Classes menu controls class-level skips**: the menu shows checkboxes for the classes represented by that generated date. Unchecking a class saves an `is_skipped` override for that one rule/class/original date; checking it again removes the skip when the date is original, or saves an active moved-date override when the row date is changed. Generation still omits skipped occurrences.
- Delivery commit `6b90405` was pushed to `origin/main`; Vercel reported success. Live checks after push: `https://www.mathclaw.com/` returned 200, `/onboarding/profile` returned the expected unauthenticated sign-in redirect, and a protected class-plan route returned the expected sign-in redirect.
- Verification passed locally: `node --check app/onboarding/profile/page.js`; `node --check app/onboarding/profile/actions.js`; `node --check lib/announcements/assignment-rules.js`; `git diff --check`; `npm run build`. Authenticated Profile click-through remains dependent on Zack's signed-in browser session.

## What Was Built (2026-06-09 Session — Announcement preview row polish and skip overrides)

- **Announcement Assignment preview rows tightened** (`app/onboarding/profile/page.js`): Profile preview rows no longer show the redundant Assignment column. The assignment date input is narrower, Save sits beside the date on the same row, and each row has a Delete button at the end.
- **Per-occurrence skip overrides added** (`app/onboarding/profile/actions.js`, `app/classes/[id]/announcements/actions.js`, `lib/announcements/assignment-rules.js`, `supabase/schema.sql`, `supabase/migrations_20260609_announcement_assignment_override_skips.sql`): Delete stores `is_skipped = true` for the generated occurrence keyed by rule/class/original date, so announcement generation omits that one assignment for that one class without changing the rule.
- **Production Supabase migration applied** to `mathclaw-prod` / `ruaaznacaywngewxyged`: migration list confirms `announcement_assignment_override_skips` version `20260609144326`.
- Verification passed locally: `node --check lib/announcements/assignment-rules.js`; `node --check app/onboarding/profile/page.js`; `node --check app/onboarding/profile/actions.js`; `node --check app/classes/[id]/announcements/actions.js`; `git diff --check`; `npm run build`.

## What Was Built (2026-06-09 Session — Standing make-it-live instruction)

- **Brain delivery convention tightened** (`brain/START_HERE.md`, `brain/conventions.md`, `brain/model_workflows/codex.md`, `brain/session_handoff.md`): Zack's standing instruction is now explicit: always carry completed fix/build/change work live on MathClaw unless he explicitly says not to. Future implementation sessions should assume local edits, verification, production migration when needed, commit, push, deployment/promotion, and live-route confirmation are part of the task.

## What Was Built (2026-06-09 Session — Announcement assignment previews and rescheduling)

- **Announcement Assignment rule previews added** (`app/onboarding/profile/page.js`, `lib/announcements/assignment-rules.js`): each saved rule card in Profile → School Calendar → Announcement Assignments now shows the generated schedule for the school year. Rules scoped to all classes render occurrence rows per class so A/B calendars and meeting days can differ. Preview rows show class, original generated date, editable assignment date, assignment label, and marking period when available.
- **Manual rescheduling overrides added** (`app/onboarding/profile/actions.js`, `app/classes/[id]/announcements/actions.js`, `supabase/schema.sql`, `supabase/migrations_20260609_teacher_announcement_assignment_rule_overrides.sql`): changing an occurrence date saves an override keyed by `owner_id`, `rule_id`, `course_id`, and `original_date`; changing it back to the original date removes the override. Announcement generation now honors overrides when placing `{assignments}` while leaving the rule itself unchanged. The older `teacher_announcement_assignments` selected-instance table remains inactive/harmless.
- **Production Supabase migration applied** to `mathclaw-prod` / `ruaaznacaywngewxyged`: migration list confirms `teacher_announcement_assignment_rule_overrides` version `20260609121757`. The table has owner-scoped RLS, rule/course ownership checks, no anon grants, and SELECT/INSERT/UPDATE/DELETE grants for authenticated users.
- Verification passed locally: `node --check lib/announcements/assignment-rules.js`; `node --check app/onboarding/profile/page.js`; `node --check app/onboarding/profile/actions.js`; `node --check app/onboarding/profile/announcement-assignment-rule-form.js`; `node --check app/classes/[id]/announcements/actions.js`; `git diff --check`; `npm run build`. Local browser check of `/onboarding/profile` returned the expected unauthenticated sign-in path with no application error. Authenticated Profile click-through remains dependent on Zack's signed-in browser session.

## What Was Built (2026-06-09 Session — Announcement assignment rule form polish)

- **Announcement Assignment rule form simplified** (`app/onboarding/profile/page.js`, `app/onboarding/profile/announcement-assignment-rule-form.js`, `app/onboarding/profile/actions.js`, `app/classes/[id]/announcements/actions.js`, `supabase/schema.sql`, `supabase/migrations_20260609_announcement_rule_count_range.sql`): the Profile → School Calendar → Announcement Assignments UI now has a compact first line with Assignment Type, Applies To, and Happens Every choices. The relevant controls appear below based on the selected cadence instead of showing all fields at once.
- **Cadence behavior updated**: weekly is now “every N weeks” with multiple Monday-Friday checkboxes, replacing the separate every-2-weeks mode while preserving backward compatibility for old `biweekly` rules. Monthly uses one day-of-month field plus first school day after/before. Marking period uses “times per marking period” plus optional Monday-Friday filters; generation spaces those occurrences evenly across matching class days in each marking period.
- **Production Supabase migration applied** to `mathclaw-prod` / `ruaaznacaywngewxyged`: migration list confirms `announcement_rule_count_range` version `20260609115350`, widening `count_per_period` from 1-5 to 1-20.
- Verification passed: `node --check app/onboarding/profile/page.js`; `node --check app/onboarding/profile/actions.js`; `node --check app/onboarding/profile/announcement-assignment-rule-form.js`; `node --check app/classes/[id]/announcements/actions.js`; `git diff --check`; `npm run build`. Authenticated browser click-through remains unverified in this session.

## What Was Built (2026-06-08 Session — Announcement assignment rules rework)

- **Profile Announcement Assignments reworked from date checkboxes to assignment-type rules** (`app/onboarding/profile/page.js`, `app/onboarding/profile/actions.js`, `app/classes/[id]/announcements/actions.js`, `supabase/schema.sql`, `supabase/migrations_20260608_teacher_announcement_assignment_rules.sql`): teachers now create expandable assignment type rules instead of selecting every generated date. A rule stores assignment type/name, optional class scope, cadence, times per period, and cadence-specific settings.
- **Supported cadences**: every week, every 2 weeks, every month, and every marking period. Weekly/every-2-weeks rules use selected weekdays; monthly rules use day(s) of month plus first school day after/before if the target is not a school day; marking-period rules use selected school-day positions within each marking period.
- **Generated announcements now compute `{assignments}` from rules** at regeneration time, using class calendars, A/B meeting days, and marking period rules. The old `teacher_announcement_assignments` selected-instance table remains harmless but is no longer the active source for generated announcement assignment lines.
- **Production Supabase migration applied** to `mathclaw-prod` / `ruaaznacaywngewxyged`: migration list confirms `teacher_announcement_assignment_rules` version `20260608180949`. Table has owner-scoped RLS, course ownership checks for course-specific rules, no anon grants, and SELECT/INSERT/UPDATE/DELETE grants for authenticated users.
- Verification passed: `node --check app/onboarding/profile/page.js`; `node --check app/onboarding/profile/actions.js`; `node --check app/classes/[id]/announcements/actions.js`; `git diff --check`; `npm run build`. Authenticated browser click-through remains unverified in this session.

## What Was Built (2026-06-08 Session — Announcement assignment candidates)

- **Profile Announcement Assignments added** (`app/onboarding/profile/page.js`, `app/onboarding/profile/actions.js`, `app/classes/[id]/announcements/actions.js`, `supabase/schema.sql`, `supabase/migrations_20260608_teacher_announcement_assignments.sql`): inside Profile → School Calendar, teachers now get generated checkbox candidates for recurring announcement assignment lines. Current generators cover Friday Assessments for every-day classes, Thu/Fri Assessments for A/B classes, 3 Notebook Checks per marking period on Fridays, and 2 Choice Board rows per marking period. Saving checked rows stores selected assignment instances and regenerates announcements for all owned courses.
- **`{assignments}` now reads selected rows** from `teacher_announcement_assignments` and formats each selected line on the matching announcement date, with optional `| Due M/D` text. The older text-box recurring assignment fallback still works and is appended after selected rows when enabled.
- **Production Supabase migration applied** to `mathclaw-prod` / `ruaaznacaywngewxyged`: migration list confirms `teacher_announcement_assignments` version `20260608164344`. Table has owner-scoped RLS, course ownership checks for course-specific rows, no anon grants, and SELECT/INSERT/UPDATE/DELETE grants for authenticated users.
- Verification passed: `node --check app/onboarding/profile/page.js`; `node --check app/onboarding/profile/actions.js`; `node --check app/classes/[id]/announcements/actions.js`; `git diff --check`; `npm run build`. Authenticated Profile UI click-through remains unverified in-browser in this session.

## What Was Built (2026-06-08 Session — Class Plan Out? checkboxes + marking periods)

- **Out? checkbox column added to class plan Full Calendar Editor** (`app/classes/[id]/plan/page.js`, `app/classes/[id]/calendar/actions.js`, `app/globals.css`): each row now has an **Out?** checkbox checked when `day_type === 'grace_day'`. Checking it and hitting Update Schedule sets that day to `grace_day` for that class only. Profile Out? still applies to all classes; class-plan Out? is per-class. `parseBulkUpdates` in `actions.js` now handles `out__DATE` form fields, overriding `day_type` to `grace_day` when checked. Grid updated from 6 to 8 columns (added MP and Out?). Commits `098d471`, `307b49d`.
- **Marking period (MP) column added to class plan Full Calendar Editor**: each row shows which marking period it falls in (e.g. "Quarter 1") based on `teacher_marking_period_rules` and school-day numbering.
- **Marking period + Day# shown in Lesson by Day card headers**: each date heading shows the marking period name and school day# as a small subtitle (e.g. `Quarter 1 · Day #6`).
- **School-day numbering fixed**: walks all weekdays in the school year range, using `school_calendar_days` only to skip `off` days — same logic as the profile page. Sporadic MP labels were caused by only iterating over explicitly-set rows in that sparse table.
- **Data loaded per plan page render**: `school_calendar_days` (for the teacher's owner_id) and `teacher_marking_period_rules` are now fetched in the class plan `Promise.all`.

## What Was Built (2026-06-08 Session — Profile calendar polish + Teacher Out)

- **Teacher Out checkboxes added to Profile School Calendar** (`app/onboarding/profile/page.js`, `app/onboarding/profile/actions.js`, `app/globals.css`, production Supabase migrations): each weekday row now has an **Out?** checkbox. Checking it marks that day as `grace_day` across all class plans — the school day number still counts and A/B label is kept, but no lesson is assigned. Applied `grace_day` constraint to both `school_calendar_days` and `course_calendar_days` in production via MCP. `parseSchoolCalendarRows` parses `teacher_out__DATE` checkbox fields; a checked row forces `day_type = grace_day` regardless of the Day Type dropdown. Commits `457b727`, `75ff97c`, `54c8cc9`.
- **Teacher Absences section removed** from Profile page — replaced by the Out? checkboxes. Actions remain in `actions.js` for announcement generation backend use.
- **Day # column added** to Profile school calendar rows showing `#1`, `#2`, etc. for school days and `—` for off days. Grid updated to 7 columns.
- **Marking period cards tightened** — reduced padding, zeroed ctaRow margin-top, switched text lines to a flex column with small gap, Delete button vertically centered. Commits `e4d4cc5`, `e73195f`.
- **Grace Day migration status**: `grace_day` is now live in production for both `school_calendar_days` and `course_calendar_days`. The old `migrations_20260605_grace_day_type.sql` concern in the handoff is resolved.

## What Was Built (2026-06-08 Session — Calendar date display fix)
- **Root cause found and fixed for Profile School Calendar always showing default dates** (`app/onboarding/profile/page.js`, production Supabase migration):
  - Root cause: `nickname` column was never migrated to production profiles table. The primary profile SELECT (which includes `nickname`) failed on every page load. The error fallback caught the "nickname" error but hardcoded `school_year_start: defaults.start` / `school_year_end: defaults.end` instead of reading actual saved values. Result: saves verified correctly in the DB but the form always displayed the default `9/1/2025`–`6/30/2026` dates.
  - Fix 1: Applied `profile_nicknames` migration to production Supabase (`ruaaznacaywngewxyged`): `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname text`. Confirmed via MCP `apply_migration`.
  - Fix 2: Fallback retry SELECT in `page.js` now also fetches `school_year_start, school_year_end` so actual DB values are used even if other columns are later missing.
  - Production DB confirmed: profile already has `school_year_start = 2026-09-02`, `school_year_end = 2027-06-16` (saved correctly in prior sessions; just never displayed).
  - Verification: `node --check app/onboarding/profile/page.js`, `npm run build` passed. Commit `86655ac` pushed to `origin/main`.

## What Was Built (2026-06-05 Session — Class Plan overhaul)
- **Grace Day added as a new `day_type`** (`supabase/migrations_20260605_grace_day_type.sql`, `app/classes/[id]/calendar/actions.js`, `lib/planning/rebuild-plan.js`, `app/classes/[id]/plan/page.js`): Grace days are school days that keep their A/B label but get no lesson slot. They appear in all day_type dropdowns. The pacing engine filters `grace_day` the same as `off`. Migration extends the `course_calendar_days.day_type` check constraint — **must be applied to production Supabase before saving Grace Days.**
- **Class Plan controls reorganized**: date range form and pacing mode form moved from the top card into the Modify Calendar section. Back to Classes button removed (topbar nav covers it).
- **Copy Calendar to Other Classes**: new button in Modify Calendar. Copies all non-grace day_type and reason_id values to all other teacher-owned courses for overlapping date ranges, then rebuilds plans for affected courses. Grace days are excluded from the copy.
- **Apply to all my classes checkbox**: added to the Apply Calendar Changes form. When checked, the bulk calendar update also runs the copy-to-other-classes logic in one action.
- **Weekend rows hidden for Every Day classes**: `visibleCalendarDays` now filters weekends for non-AB classes (same filter AB classes already used). Weekends no longer appear in the plan view.
- **Short date format site-wide**: ISO dates (`2026-09-02`) replaced with `M/D/YYYY` (`9/2/2026`) in plan page subtitle, class list cards, and new-class import dropdown. `shortDate()` helper added locally to each file. Date input fields changed from `type="date"` (picker) to `type="text"` so teachers can type dates; action accepts both `M/D/YYYY` and `YYYY-MM-DD`.
- **Projected Final Lesson Date on plan stats card**: computed from last lesson plan row (same logic as dashboard `projectedEnd`); shown only when curriculum is enabled.
- **kv label column widened**: `210px` → `240px` so "Generated Announcements" and similar labels fit on one line.
- **Arcade Suggestions toggle**: checkbox in top-right of plan page header card. Unchecking hides all Suggested MathClaw Skills blocks on lesson cards. State stored in `hide_arcade_suggestions` browser cookie — applies across all class plan pages on same browser, no migration needed. Implemented as a client component (`arcade-suggestions-toggle.js`) that sets the cookie and calls `router.refresh()`.
- All commits pushed to `origin/main`; builds verified with `node --check` + `npm run build`.

## What Was Built (2026-06-04 Session — Projector Question Builder)
- **Projector saved-item Question Builder implemented without a migration** (`app/projector/page.js`, `app/projector/projector-client.js`, `app/projector/screen/screen-client.js`, `app/api/projector/route.js`, `app/globals.css`):
  - Added `Fill In The Blank` and `Multiple Choice` composer buttons for all content modes. Either mode can turn Text, LaTeX, Image, or Video content into a question, with the selected content acting as the prompt.
  - Removed the separate `Question Prompt` field. `Top Text` is now the only extra text field when the teacher wants text above the selected content.
  - Multiple Choice supports four A-D answer choices, an optional marked correct answer, and Text/LaTeX answer format. Fill In The Blank supports an optional answer key, Text/LaTeX answer format, and renders a large blank answer line.
  - Multiple Choice option groups are centered, and answer content is centered within each option card while keeping A-D badges pinned to the left.
  - LaTeX answer-option styling now targets only direct child answer wrappers, preserving KaTeX internals so fraction bars render inside Multiple Choice answers.
  - Marked Multiple Choice answers and Fill In The Blank answer keys are hidden by default. Dashboard question screen cards now show a `Reveal Answer` / `Hide Answer` button under the screen preview.
  - Reveal state is stored per screen in `projector_sessions.screen_states`, broadcasts to connected projector screens, and resets when the teacher sends new content to that screen. This uses the existing screen-state JSON and requires no Supabase migration.
  - `/api/projector` now supports a `reveal-answer` action that toggles the current question screen's reveal state and broadcasts the updated state.
  - Replaced the checkbox-style controls with engaged buttons for `Top Text`, `Fill In The Blank`, and `Multiple Choice`, matching the existing Projector control style.
  - Text-mode questions suppress the redundant base text content in previews and public screens, leaving the question card itself as the visible content.
  - Question metadata is encoded inside the existing saved/sent `content` field and unwrapped by dashboard previews, screen cards, saved-item thumbnails, public projector screens, and API validation. This keeps the current `projector_library_items.content_type` check constraint unchanged.
  - `/projector` now loads saved-item `category` on initial server render with the same missing-column fallback pattern used by the API.
  - Verification passed: `node --check app/projector/projector-client.js`; `node --check app/projector/screen/screen-client.js`; `node --check app/projector/page.js`; `node --check app/api/projector/route.js`; `git diff --check`; `npm run build`; built server route checks confirmed `/projector/screen` returns 200 and unauthenticated `/projector` redirects to sign-in.
  - Verification caveat: direct authenticated teacher dashboard creation/save/send was not browser-tested because no local authenticated teacher session was available. Local `next dev` still hit the known `EMFILE` watcher problem and served 404s, so route verification used `next start --port 3001`.

## What Was Built (2026-06-04 Session — Projector image drag-and-drop)
- **Projector Image mode now accepts dragged image files** (`app/projector/projector-client.js`, `app/globals.css`):
  - The Image composer preview is now a visible drop zone. Teachers can drag a Mac screenshot thumbnail or image file into the box to load it, then send it through the existing Projector flow.
  - Dropped images reuse the same file validation as the file picker: image-only, 5MB max, and a classroom Wi-Fi warning for images over 2MB.
  - Accepted dropped/file-picked images clear the Image URL field so the composer uses the dropped image unambiguously.
  - Verification passed: `node --check app/projector/projector-client.js`; `git diff --check`; `npm run build`.
  - Verification caveat: direct browser drag/drop testing was blocked because the sandbox would not bind local servers (`EPERM` on ports 3000 and 3001), and no authenticated teacher browser session was available.

## What Was Built (2026-06-04 Session — Projector LaTeX arrow spacing)
- **Projector LaTeX now shows typed spacing around arrows** (`app/projector/projector-client.js`, `app/projector/screen/screen-client.js`):
  - Dashboard preview and public projector screen rendering now convert spaces adjacent to `\\uparrow`, `\\downarrow`, literal `↑`/`↓`, and standalone `^` into visible LaTeX spacing.
  - Up/Down helper buttons now insert `\\uparrow\\;` and `\\downarrow\\;` so spacing appears immediately after a button press.
  - Verification passed: `node --check` on changed projector JS files; `git diff --check`; `npm run build`; built server route checks confirmed `/projector/screen` returns 200 and unauthenticated `/projector` redirects to sign-in.
  - Verification caveat: direct authenticated dashboard typing was not browser-tested because no local authenticated teacher session was available.

## What Was Built (2026-06-04 Session — Projector LaTeX helper buttons)
- **Projector LaTeX composer now has quick-insert helper buttons** (`app/projector/projector-client.js`, `app/globals.css`):
  - Added `Fraction`, `Sqrt`, `Up`, and `Down` buttons beside the `LaTeX` label above the LaTeX textarea.
  - Buttons insert `\\frac{}{}`, `\\sqrt{}`, `\\uparrow\\;`, and `\\downarrow\\;` at the current cursor/selection. Fraction and square-root helpers place the cursor inside the first useful braces.
  - Verification passed: `git diff --check`; `npm run build`; built server route checks confirmed `/projector/screen` returns 200 and unauthenticated `/projector` redirects to sign-in.
  - Verification caveat: direct authenticated dashboard clicking/typing was not browser-tested because no local authenticated teacher session was available. A standalone `node --check app/projector/projector-client.js` retry was blocked twice by tool permission review timeouts, but the full Next build compiled successfully.

## What Was Built (2026-06-04 Session — Projector dashboard top-text preview containment)
- **Projector dashboard previews now mirror live top-text media containment** (`app/globals.css`):
  - Dashboard screen-card preview stacks use a bounded media body with positioned image/video media, matching the live projector screen containment behavior.
  - Dashboard top-text thumbnail size and spacing were reduced so preview cards do not show cropped media when top text is enabled.
  - Verification passed: `git diff --check`; `npm run build`; built server route checks confirmed `/projector/screen` returns 200 and unauthenticated `/projector` redirects to sign-in.
  - Verification caveat: authenticated dashboard visual replay with teacher-sent sample media was not browser-tested because no local authenticated teacher session was available.

## What Was Built (2026-06-03 Session — Projector top-text media hard containment)
- **Projector images with top text now use a hard bounded media box** (`app/globals.css`):
  - Further reduced public screen top-text font size.
  - Made the top-text media body a positioned bounded container and inset image/video media to `100% × 100%` with `object-fit: contain`, preventing images from exceeding the remaining screen area.
  - Verification passed: `git diff --check`; `npm run build`; built server route checks confirmed `/projector/screen` returns 200 and unauthenticated `/projector` redirects to sign-in.
  - Verification caveat: authenticated/live projector visual replay with teacher-sent sample media was not browser-tested because no local authenticated teacher session was available.

## What Was Built (2026-06-03 Session — Projector top-text media containment)
- **Projector top text no longer crowds/crops image media on public screens** (`app/globals.css`):
  - Reduced public screen top-text font size, gap, and padding for media-with-top-text layouts.
  - Changed media inside the top-text screen body to use available-cell containment (`auto` size with `max-width`/`max-height: 100%`) instead of forced viewport dimensions, so images remain fully visible below the text.
  - Verification passed: `git diff --check`; `npm run build`; built server route checks confirmed `/projector/screen` returns 200 and unauthenticated `/projector` redirects to sign-in.
  - Verification caveat: authenticated/live projector visual replay with teacher-sent sample media was not browser-tested because no local authenticated teacher session was available.

## What Was Built (2026-06-03 Session — Projector screen edit buttons and bidirectional rotation)
- **Projector screen cards now support quick editing and two-way rotation** (`app/projector/projector-client.js`, `app/api/projector/route.js`, `app/globals.css`):
  - Added an `Edit` button beside each `Screen 1`/`Screen 2`/`Screen 3`/`Screen 4` label. It loads that screen's current content back into the composer, including type, content URL/data, and optional top text, selects that screen as the send target, and opens Screen Selection for editing/resending.
  - Empty screens show a disabled `Edit` button and do not alter the composer.
  - Replaced the single rotate control with `↶ Rotate Left` and `↷ Rotate Right`. The API now accepts a `direction` for `rotate-screens`; right preserves the old behavior, left reverses it so accidental rotations can be undone immediately.
  - Verification passed: `node --check` on changed projector JS files; `git diff --check`; `npm run build`; built server route checks confirmed `/projector/screen` returns 200 and unauthenticated `/projector` redirects to sign-in.
  - Verification caveat: authenticated teacher dashboard clicking/editing was not browser-tested because no local authenticated teacher session was available.

## What Was Built (2026-06-03 Session — Projector optional top text for media)
- **Projector media composer now supports optional text above LaTeX/image/video content** (`app/projector/projector-client.js`, `app/projector/screen/screen-client.js`, `app/api/projector/route.js`, `app/globals.css`):
  - Added a `Text?` checkbox below the content type tabs for LaTeX, Image, and Video. It is hidden for plain Text mode.
  - When enabled, teachers can type `Top Text`, which renders as a plain-text header above the selected LaTeX/image/video in the composer preview, dashboard screen cards, and public projector screens.
  - The optional top text is included in `projector_sessions.screen_states`, broadcast payloads, image refetch flows, screen rotation, and saved/restored Scenes. It is intentionally ignored for plain Text content.
  - Verification passed: `node --check` on changed projector JS files; `git diff --check`; `npm run build`; built server route checks confirmed `/projector/screen` returns 200 and unauthenticated `/projector` redirects to sign-in.
  - Verification caveat: authenticated teacher dashboard typing/sending was not browser-tested because no local authenticated teacher session was available.

## What Was Built (2026-06-03 Session — Projector LaTeX percent/caret display support)
- **Projector LaTeX now displays teacher-typed percent signs and standalone caret/up-arrow symbols** (`app/projector/projector-client.js`, `app/projector/screen/screen-client.js`):
  - Dashboard preview and public projector screen rendering now normalize unescaped `%` to a visible LaTeX percent instead of letting KaTeX treat it as a comment marker.
  - Standalone `^` and literal `↑` are rendered as an up arrow, while normal exponent syntax like `x^2`, `x^{2}`, and `x^\\prime` remains available.
  - Verification passed: `node --check` on changed projector JS files; `git diff --check`; `npm run build`; built server route checks confirmed `/projector/screen` returns 200 and unauthenticated `/projector` redirects to sign-in.
  - Verification caveat: authenticated teacher dashboard typing/sending was not browser-tested because no local authenticated teacher session was available.

## What Was Built (2026-06-03 Session — Projector LaTeX whitespace/newline support)
- **Projector LaTeX now preserves typed whitespace and supports literal line breaks** (`app/projector/projector-client.js`, `app/projector/screen/screen-client.js`, `app/api/projector/route.js`, `app/globals.css`):
  - Projector API normalization now validates text/LaTeX with `trim()` but stores and sends the original string, so leading/trailing spaces and blank edge lines are not stripped. URL-based media content still trims as before.
  - Dashboard LaTeX preview and public projector screen rendering now split literal newlines into stacked KaTeX display rows, preserving blank lines as spacing.
  - Added a small shared `.projectorLatexLine` spacing rule.
  - Verification passed: `node --check` on changed projector JS files; `git diff --check`; `npm run build`; built server route checks confirmed `/projector/screen` renders without console errors and unauthenticated `/projector` redirects to sign-in.
  - Verification caveat: authenticated teacher dashboard typing/sending was not browser-tested because no local authenticated teacher session was available; local `next dev` still hit the known `EMFILE` watcher failure, so browser checks used `next start --port 3001`.

## What Was Built (2026-06-02 Session — Projector Saved Items Library polish)
- **Category tagging, search/filter, and inline rename added to Saved Items library** (`app/projector/projector-client.js`, `app/api/projector/route.js`, `app/globals.css`, `supabase/migrations_20260602_projector_library_category.sql`):
  - Added nullable `category` column to `projector_library_items` with check constraint on 6 allowed values: `Questions`, `Activities`, `Word Walls`, `Data Walls`, `News`, `Announcements`. Migration applied to production `ruaaznacaywngewxyged`.
  - Save form now includes a Category dropdown below the item name input.
  - Library list shows a search input and category filter pills (All + 6 categories) when any items exist. Filtering is client-side.
  - Each item card shows `Category · Content Type` in the label row.
  - Rename button on each item opens an inline form to update title and category without touching content. `rename-library-item` API action handles the update with fallback for when the column is not yet migrated.
  - Empty-state copy clarified to distinguish single saved items from Scenes (full room layouts).
  - Commit `3ded434` pushed to `origin/main`.
  - Verification: `node --check` on both changed JS files; `git diff --check`; `npm run build` passed; migration connector returned `success: true`.
  - Verification caveat: authenticated teacher browser testing blocked (no local authenticated session available).

## What Was Built (2026-06-02 Session — Projector tab polish)
- **Composer moved into Screen Selection panel** (`app/projector/projector-client.js`): the text/LaTeX/image/video inputs, preview, Send, and Clear buttons now live inside the Screen Selection collapsible panel, directly below the media type tabs. Commit `1227f4b`.
- **PIN-based projector screen URLs** (`app/projector/screen/[pin]/[screenNumber]/page.js`, `screen-client.js`, `projector-client.js`): screens now use readable URLs like `mathclaw.com/projector/screen/287645/1`. The new dynamic route resolves pin→token server-side. Old `?token=` URLs continue to work. Commit `3d7f269`.
- **Scenes panel redesign** (`projector-client.js`, `globals.css`): "Room Setups" renamed to "Scenes" throughout. Folders are now collapsible sections (all closed by default) with styled header rows. Save controls moved to the top of the panel. "Delete Folder" replaced with a small right-aligned "D" button inside each folder header. "+ New Folder" button at the bottom reveals an inline name field. Commits `e669ed5`, `300c963`.
- **Rotate Screens button** (`projector-client.js`, `app/api/projector/route.js`, `globals.css`): a centered "↻ Rotate Screens" button sits below the 2×2 screen grid. One API call rotates 1→2→3→4→1, updates the DB, and broadcasts to all connected screens. Commit `5e96183`.
- **Projector screen scroll fix** (`globals.css`): stage locked to `100dvh` with `overflow: hidden`; media capped at `100vw × 100dvh` with `object-fit: contain`; body also locked to prevent ancestor scroll. Images and videos now always fit the viewport without scrolling. Commit `1e7a2cd`.

## What Was Built (2026-06-02 Session — Projector sidebar/media/library polish)
- **Projector dashboard sidebar and media behavior were cleaned up** (`app/projector/projector-client.js`, `app/projector/screen/screen-client.js`, `app/globals.css`):
  - The sidebar now uses collapsible panels: **Screen Selection** is at the top and open by default; **Room Setups** and **Saved Items** are collapsible below it.
  - The content type picker now lives inside **Screen Selection**, and visible Projector section labels use title case such as **Screen Selection**, **Room Setups**, and **Saved Items**.
  - Room Setup folder filters now render as a two-column alphabetical list, filling top-left then top-right and continuing down the rows.
  - Saved video/GIF thumbnails no longer autoplay in saved-item and room-setup lists. The four dashboard screen preview cards still play video content, and the actual `/projector/screen` receiver now lets images/videos use the full viewport with less wasted black margin.
  - Delivery commits pushed to `origin/main`: `a6ec541` (folder filter layout), `bbfc87d` (static saved video thumbnails), `c1d5a7b` (videos still play in screen previews), `de0e774` (collapsible sidebar), `d78eff6` (media fills screens), and `3aff94d` (content tabs moved into Screen Selection).
  - Verification passed across the relevant edits: `node --check` on changed Projector JS files, `git diff --check`, and `npm run build`. Live unauthenticated checks continued to show protected `/projector` redirects and reachable public/API guard routes.
  - Verification caveat: authenticated teacher UI/browser testing remains incomplete because local server binding has repeatedly failed with sandbox `EPERM`, and no authenticated teacher browser session was available.

## What Was Built (2026-06-02 Session — Projector video even-dimension fix)
- **Projector video conversion fixed for high-bitrate ReplayKit MOV with odd scaled height** (`app/api/projector/upload-video/route.js`):
  - Root cause for the 9:34 AM recording failure: the projector-friendly scale settings converted the 1916x948 clip to `1280x633`; H.264/libx264 requires even dimensions, so ffmpeg failed with `height not divisible by 2`, but the UI only showed the generic final line `Conversion failed!`.
  - Fix: changed the ffmpeg scale expression to force both output width and height to even numbers while avoiding upscaling. The failing clip now converts locally to `1280x632` and about 1.5MB.
  - Improved ffmpeg error extraction so future failures prefer meaningful lines like `height not divisible by 2`, `Invalid argument`, or encoder-open errors instead of the generic final `Conversion failed!`.
  - Verification passed: local ffmpeg conversion of `/Users/zackarenstein/Desktop/Screen Recording 2026-06-02 at 9.34.00 AM.mov`; `node --check app/api/projector/upload-video/route.js`; `git diff --check`; `npm run build`.

## What Was Built (2026-06-02 Session — Projector video upload reliability)
- **Projector video upload failure handling improved** (`app/api/projector/upload-video/route.js`, `app/projector/projector-client.js`):
  - Investigated failing teacher upload `Screen Recording 2026-06-02 at 9.34.00 AM.mov`: 25MB, 8.19s, 1916x948, about 53fps, about 25.8 Mbps, H.264/AAC QuickTime. The file is short but unusually dense, making the prior full-quality transcode likely to hit the serverless conversion timeout path.
  - Projector video conversion now targets projector-friendly output: max 1280px width, 30fps, H.264 `veryfast`, CRF 28, yuv420p, AAC audio, and faststart MP4. This should convert high-bitrate screen recordings much faster while keeping classroom display quality reasonable.
  - Dashboard video upload fetches now tolerate non-JSON platform/server error bodies and show a normal "Could not convert..." style message instead of raw `Unexpected token ... is not valid JSON`.
  - Verification passed: `node --check app/api/projector/upload-video/route.js`; `node --check app/projector/projector-client.js`; `git diff --check`; `npm run build`.
  - Verification caveat: direct local ffmpeg timing and local route testing were blocked by sandbox execution/server-binding restrictions; authenticated production upload of the specific teacher file still needs a live retry after deployment.

## What Was Built (2026-06-02 Session — Projector Scene Library folders)
- **Projector Room Setup folders implemented locally and production migration applied** (`app/projector/page.js`, `app/projector/projector-client.js`, `app/api/projector/route.js`, `app/globals.css`, `supabase/migrations_20260602_projector_scene_folders.sql`):
  - Added teacher-owned `projector_scene_folders` table and nullable `projector_scene_library_items.folder_id`, with RLS limiting each teacher to their own folders and a composite foreign key so scenes can only reference folders owned by the same teacher. Applied to production Supabase project `mathclaw-prod` / `ruaaznacaywngewxyged`; migration list showed `projector_scene_folders` at version `20260602141846`.
  - `/projector` now loads scene folders alongside saved room setups. Existing saved scenes remain visible as Uncategorized.
  - `/api/projector?action=scenes` now returns both scenes and folders; `POST /api/projector` supports `create-scene-folder`, `delete-scene-folder`, and `update-scene-folder`. Deleting a folder first moves its scenes to Uncategorized, then deletes the folder.
  - The Projector dashboard Room Setups panel now lets teachers create folders for classes/situations, filter room setups by folder, save a room setup into a folder, move an existing setup between folders, and delete folders.
  - Verification passed: `node --check app/projector/page.js`; `node --check app/projector/projector-client.js`; `node --check app/api/projector/route.js`; `git diff --check`; `npm run build`; Supabase migration apply returned `success: true`; production migration list confirmed `projector_scene_folders`.
  - Delivery: implementation commit `411b76e` pushed to `origin/main`; `git ls-remote origin main` confirmed `411b76ef25d7221c9c50db72af3830fdc2fc6ace`. Live checks after push: `https://www.mathclaw.com/projector` returned 307 to sign-in and `https://www.mathclaw.com/api/projector?action=scenes` returned the expected 401 teacher sign-in guard.
  - Verification caveat: authenticated teacher UI/browser testing was not completed because the sandbox again blocked local server binding to `127.0.0.1:3001` with `EPERM`.

## What Was Built (2026-06-02 Session — Projector Scene Library)
- **Projector Scene Library / Room Setups implemented locally and production migration applied** (`app/projector/page.js`, `app/projector/projector-client.js`, `app/api/projector/route.js`, `app/globals.css`, `supabase/migrations_20260602_projector_scene_library_items.sql`):
  - Added teacher-owned `projector_scene_library_items` table migration for saved full-room Projector scenes, with RLS limiting each teacher to their own scenes and explicit authenticated grants for Supabase Data API compatibility. Applied to production Supabase project `mathclaw-prod` / `ruaaznacaywngewxyged`; migration list showed `projector_scene_library_items` at version `20260602134120`.
  - `/projector` now loads up to 40 saved room setups for the signed-in teacher, with a missing-table fallback so the dashboard stays usable before the migration exists.
  - `/api/projector?action=scenes` lists saved scenes for authenticated teachers; `POST /api/projector` now supports `save-scene`, `load-scene`, and `delete-scene` behind the existing teacher gate.
  - The Projector dashboard now has a **Scenes / Room setups** panel. Teachers can name and save the current four-screen arrangement, preview saved room setups as a 2x2 mini-grid, load a saved room setup to all connected screens, and delete saved setups.
  - Loading a saved scene immediately restores all four screen states, including intentionally empty/cleared screens, updates `projector_sessions.screen_states`, and broadcasts updates to connected projector screens over the existing Realtime channel.
  - Verification passed: `node --check app/projector/page.js`; `node --check app/projector/projector-client.js`; `node --check app/api/projector/route.js`; `git diff --check`; `npm run build`; Supabase migration apply returned `success: true`; production migration list confirmed `projector_scene_library_items`.
  - Delivery: implementation commit `d1709ab` pushed to `origin/main`; `git ls-remote origin main` confirmed `d1709ab217d52b2bb81a26955c4ef8edd52e065a`. Live checks after push: `https://www.mathclaw.com/projector` returned 307 to sign-in, `https://www.mathclaw.com/projector/screen` returned 200, and `https://www.mathclaw.com/api/projector?action=scenes` returned the expected 401 teacher sign-in guard after Vercel rolled out the new API bundle.
  - Verification caveat: authenticated teacher UI and two-screen Realtime browser testing were not completed in this run because the sandbox blocked binding local servers to both `0.0.0.0` and `127.0.0.1` with `EPERM`.

## What Was Built (2026-06-01 Session — Projector Library v1)
- **Projector saved library v1 implemented locally** (`app/projector/page.js`, `app/projector/projector-client.js`, `app/api/projector/route.js`, `app/globals.css`, `supabase/migrations_20260601_projector_library_items.sql`):
  - Added teacher-owned `projector_library_items` table migration for saved Projector content items (`text`, `latex`, `image`, `video`) with RLS limiting each teacher to their own library. Applied to production Supabase project `mathclaw-prod` / `ruaaznacaywngewxyged`; migration list showed `projector_library_items` at version `20260602000202`.
  - `/projector` now loads up to 60 saved library items for the signed-in teacher, with a missing-table fallback so the page does not break before the migration is applied.
  - `/api/projector?action=library` lists saved items for authenticated teachers; `POST /api/projector` now supports `save-library-item` and `delete-library-item` actions behind the existing teacher gate.
  - The Projector dashboard composer now has a compact **Library / Saved items** panel. Teachers can name the current composer content, save it, load saved content back into the composer, preview saved items, and delete saved items.
  - Loading a saved item fills the composer only; teachers still choose target screen(s) and press Send, preserving the current classroom control flow.
  - Verification passed: `node --check app/projector/page.js`; `node --check app/projector/projector-client.js`; `node --check app/api/projector/route.js`; `git diff --check`; `npm run build`; built-server route checks on `localhost:3001` confirmed `/projector` redirects unauthenticated users, `/api/projector?action=library` returns 401 unauthenticated, and `/projector/screen` renders the public connect screen.
  - Delivery: implementation commit `21bf828` pushed to `origin/main`; `git ls-remote origin main` confirmed `21bf8282d12faffb7ce372e7f385f0e00c792109`. Live checks after push: `https://www.mathclaw.com/projector` returned 307 to sign-in, `https://www.mathclaw.com/projector/screen` returned 200, and `https://www.mathclaw.com/api/projector?action=library` returned the expected 401 teacher sign-in guard after Vercel finished rolling out the new API bundle.
  - Verification caveat: authenticated teacher save/load/delete UI was not browser-tested because no authenticated local teacher session was available in this run. Dev server on port 3000 still showed the known `EMFILE: too many open files, watch` issue, so route checks used `next start --port 3001` after a successful build.

## What Was Built (2026-06-01 Session — Projector Party)
- **Projector Party built and pushed for MathClaw** (`app/projector/*`, `app/api/projector/route.js`, `app/layout.js`, `app/globals.css`, `supabase/migrations_20260601_projector_sessions.sql`, implementation commit `bd2273c`, handoff commit `f4260bd`, pushed to `origin/main`):
  - Added teacher-only `/projector` with one persistent projector session per teacher, 6-digit room PIN, four screen tokens, a 2x2 screen dashboard, per-screen copyable `https://mathclaw.com/projector/screen?token=...` URLs, and composer controls for LaTeX, images/GIFs, and hosted video URLs.
  - Added public `/projector/screen` receiver with PIN + screen number resolution or direct token connection, fullscreen dark-stage rendering, KaTeX display, centered image/GIF/video rendering, and reconnecting Supabase Broadcast subscription.
  - Added `/api/projector` for public token/PIN resolution and authenticated teacher push/clear actions. Teacher actions update `projector_sessions.screen_states` and broadcast `screen-updated` events on `projector-session-<sessionId>`.
  - Added teacher nav item `Projector` after `Classes`.
  - Follow-up commit `c5e39ab` replaced the subtle composer dropdown with a prominent segmented target picker (`All`, `1`, `2`, `3`, `4`) so teachers can clearly choose which screen receives the next send/clear action.
  - Follow-up commit `d71337a` replaced the `/projector/screen` screen-number dropdown with four large `Screen 1` / `Screen 2` / `Screen 3` / `Screen 4` buttons for easier projector interaction.
  - Follow-up commit `030e04e` added a plain Text content type alongside LaTeX/Image/Video, including dashboard preview support, API validation, and fullscreen projector rendering.
  - Follow-up commit `1974bec` fixed uploaded image delivery to connected projector screens by broadcasting a small refetch signal for image updates instead of trying to send the base64 image through Supabase Realtime Broadcast.
  - Follow-up commit `ab166c8` fixed dashboard screen-card image previews to use true contain sizing, so square images preview the same way they fit on projector screens instead of being cropped vertically.
  - Follow-up commit `9251f57` aligned Projector plain-text font rendering across dashboard previews, laptop projector screens, and classroom projectors by switching Projector text from `Gill Sans` to the web-safe `Arial, Helvetica, sans-serif` stack.
  - Follow-up work added teacher video/screen-recording upload support: dashboard uploads the original recording directly to Supabase Storage using a signed upload URL, `/api/projector/upload-video` converts it to web-safe MP4 with `ffmpeg-static`, stores the converted MP4 in the public `projector-videos` bucket, and sends the resulting URL through the existing Video content path. The first upload request creates the bucket if it does not already exist.
  - Follow-up correction removed the Projector video Storage bucket's per-bucket file size limit and updates existing `projector-videos` bucket settings before each prepare/convert action; MathClaw still enforces its own 75MB client/server guard, and this avoids stale bucket settings rejecting tiny `.mov` recordings as too large.
  - Follow-up correction added a direct small-file upload path for Projector videos under 4MB, bypassing signed Storage upload before conversion. The same route now returns the final ffmpeg stderr line when conversion fails, so production failures expose the actual conversion reason instead of a generic message.
  - Follow-up correction added a Vercel fallback resolver for the `ffmpeg-static` binary after production reported `spawn /ROOT/node_modules/ffmpeg-static/ffmpeg ENOENT`; the route now checks the package-reported path and `process.cwd()/node_modules/ffmpeg-static/ffmpeg` before spawning ffmpeg.
  - Production Supabase migration `projector_sessions` was applied through the Supabase connector to project `mathclaw-prod` / `ruaaznacaywngewxyged` and returned `success: true`. A follow-up migration-list call requested connector reauthentication, so migration-list verification did not complete; project health lookup still returned `ACTIVE_HEALTHY`.
  - Verification passed: `node --check` on all new Projector JS files; `npm run build`; `git diff --check`; built local server route checks for `/projector` unauthenticated redirect and public `/projector/screen` PIN-entry render. Live checks after push: `https://www.mathclaw.com/projector` returned 307 to sign-in, `https://www.mathclaw.com/projector/screen` returned 200 with the PIN-entry form, and `https://www.mathclaw.com/api/projector?action=resolve&pin=123456&screenNumber=1` returned the expected 404 not-found JSON instead of a missing-table error.
  - Verification caveat: full authenticated teacher dashboard and live two-tab realtime screen testing were not completed locally because there was no available authenticated local teacher session and the local Supabase schema did not have the new table before production migration application.

## What Was Built (2026-05-13 Session — onboarding/admin nicknames/Connect 4 replay)
- **Student onboarding clarity, admin single-save account editing, public nicknames, and Connect 4 replay scrubbing shipped** (`app/auth/sign-up/sign-up-form.js`, `app/onboarding/profile/*`, `app/play/page.js`, `app/admin/*`, `lib/auth/account-type.js`, group-game APIs, Connect 4 API/client/tournament UI, `app/globals.css`, `supabase/schema.sql`, `supabase/migrations_20260513_profile_nicknames.sql`, `tests/connect4-replay.test.mjs`, commit `1d91bd5`, pushed to `origin/main`):
  - Student sign-up now explicitly tells students to choose Student when joining a class, pick a school, and ask their teacher for a class code. Class code remains optional but is visually emphasized on sign-up, onboarding profile, and `/play`.
  - Student `/play` opens the Classes section by default when the student has zero joined classes, with stronger first-login class-code copy.
  - Added nullable `profiles.nickname` support with production-schema fallbacks. Student/player onboarding can save a nickname; admin account cards show/search nickname while preserving official first/last/display name for admin visibility.
  - Public game/tournament display names now prefer nickname in high-value live group paths: Connect 4 tournaments, Double Board, Lowest Number Wins, and Open Middle player join/display snapshots.
  - Admin User Information now has one **Save Account Settings** form per user covering first/last name, nickname, school, account type (`teacher`/`student`/`player`), teacher-search visibility, and optional class assignment. Destructive/sensitive tools remain separate. Saves preserve the same Accounts view, filters, and opened user details with “Account settings saved.”
  - Connect 4 matches now store compact `metadata.moveHistory` for new games and expose pure replay snapshot helpers. Finished regular/tournament Connect 4 games show read-only move-by-move replay sliders; older games without history fall back to final-board-only display.
  - Verification passed: requested `node --check` set; `node --test tests/connect4-tournaments.test.mjs`; `node --test tests/connect4-replay.test.mjs`; `npm test`; `npm run build`; `git diff --check`.
  - Browser/local verification: `next dev` on port 3000 again served 404s while emitting the known `EMFILE: too many open files, watch` issue. Built server on `localhost:3001` rendered `/auth/sign-up` with the new student class-code copy and returned expected unauthenticated redirects for `/onboarding/profile`, `/admin`, `/play/connect4`, and `/play/tournaments`; local Connect 4 APIs returned 401 unauthenticated.
  - Live checks after push: `https://www.mathclaw.com/play/connect4`, `/play/tournaments`, and `/admin` returned 307 sign-in redirects; `/api/play/connect4` and `/api/play/connect4-tournaments` returned 401 unauthenticated; `git ls-remote origin main` confirmed `1d91bd5e4abb3a94b36e24bb69ffdcf4eade3ec8` on `main`.
  - Vercel connector note: project listing failed (`Failed to list projects.`), so no deployment ID was available from the connector.
  - Remaining caveat: apply `supabase/migrations_20260513_profile_nicknames.sql` in production Supabase before nickname persistence is guaranteed. Code has missing-column fallbacks, so older production schema should keep working without nickname storage.

## What Was Built (2026-05-11 Session — Connect 4 tournament best-of-3 follow-up)
- **Connect 4 Tournament best-2-of-3 behavior fixed and improved** (`app/api/play/connect4-tournaments/route.js`, `lib/student-games/connect4-tournaments.js`, `app/play/tournaments/tournament-client.js`, `app/play/connect4/game-client.js`, `app/globals.css`, `tests/connect4-tournaments.test.mjs`, commit `80e84a0`, pushed to `origin/main`):
  - Best-of-3 tournament players now both poll after a finished non-final series game. Winners see "Game won. Loading the next game...", losers see "Game lost. Loading the next game...", draws see "Draw. Loading the replay...", and the champion still sees "You won the tournament!" without redirecting.
  - Losers of a completed series no longer sit on an endless "waiting" message; the game page settles on "Series finished." when no next game belongs to them.
  - Shared best-of-3 series logic now records draw games as uncounted series games, avoids double-counting duplicate live-match processing, and exports `deriveBestOfThreeSummary()` for structured labels.
  - Tournament payloads now include best-of-3 summaries plus `seriesGames` / `previousGames` board data from all Connect 4 game IDs stored in the series, not just the current match row's `connect4_match_id`.
  - Tournament boxes and bracket cards show labels such as "Game 2 · Student A leads 1-0", "Game 3 · Series tied 1-1", and finished series scores. Single-game tournaments and byes do not show best-of-3 labels.
  - Teacher live/finished cards, student "Your Tournament Games" cards, and the Connect 4 tournament game page can show prior best-of-3 games as read-only boards; prior-game views do not expose Drop buttons or rematch controls.
  - Tournament match names now prefer `connect4_tournament_participants.display_name`, falling back to profile display names and then "Student", for player names, winners, and champion.
  - Verification passed: `node --check app/api/play/connect4-tournaments/route.js`; `node --check lib/student-games/connect4-tournaments.js`; `node --check app/play/tournaments/tournament-client.js`; `node --check app/play/connect4/game-client.js`; `node --test tests/connect4-tournaments.test.mjs`; `npm test`; `npm run build`; `git diff --check`.
  - Local/browser route verification: `next dev` on port 3000 still reproduced the known `EMFILE: too many open files, watch` issue and served 404 for tournament/connect4 routes. Built server on `localhost:3001` returned 307 sign-in redirects for `/play/tournaments` and `/play/connect4`, and `/api/play/connect4-tournaments` returned 401 unauthenticated instead of 404. Full authenticated teacher/student tournament UI verification remains blocked without an available local authenticated tournament session.
  - Live checks after push: `https://www.mathclaw.com/play/tournaments` returned 307 to sign-in, `https://www.mathclaw.com/play/connect4` returned 307 to sign-in, `https://www.mathclaw.com/api/play/connect4-tournaments` returned 401 unauthenticated, and `git ls-remote origin main` confirmed `80e84a07961fcf5882af8adf263ed999031e2514` on `main`.
  - Remaining caveat: production Tournament Mode still requires `supabase/migrations_20260506_connect4_tournaments.sql` to be applied before real authenticated use.

## What Was Built (2026-05-07 Session — Connect 4 tournament UX + best-of-3)
- **Connect 4 Tournament Mode UX and match format behavior updated** (`app/play/tournaments/tournament-client.js`, `app/api/play/connect4-tournaments/route.js`, `lib/student-games/connect4-tournaments.js`, `app/play/connect4/game-client.js`, `app/globals.css`, `tests/connect4-tournaments.test.mjs`):
  - Teacher tournament dashboard game cards now render 4 columns on desktop, 2 on medium widths, and 1 on mobile.
  - Teachers now choose match format before bracket generation: **Single game** (default) or **Best 2 of 3**.
  - The tournament API normalizes match format values and stores the setting in `connect4_tournaments.bracket.matchFormat`; existing tournaments without the field continue as single-game tournaments.
  - Best-of-3 series state is stored in `connect4_tournaments.bracket.seriesByMatchId`, with each tournament match row's `connect4_match_id` pointing to the current active Connect 4 game. Draws create an uncounted replay; player wins are counted once; a player advances after 2 wins; otherwise a fresh game is created for the same bracket match.
  - Teacher live/finished cards and the new large-board popup show Red, Yellow, and current turn/status using visible color swatches. The former teacher "Open Full Board" link is now a view-only popup with a large centered Connect 4 board.
  - Student Connect 4 hides the regular create/join/invite-code controls only for tournament-launched matches where the viewer is one of the players, replacing them with a tournament-focused color/turn card. Regular Connect 4 invite-code flow is unchanged.
  - Verification passed: `node --check app/play/tournaments/tournament-client.js`; `node --check app/api/play/connect4-tournaments/route.js`; `node --check lib/student-games/connect4-tournaments.js`; `node --check app/play/connect4/game-client.js`; `node --test tests/connect4-tournaments.test.mjs`; `npm test`; `npm run build`; `git diff --check`.
  - Browser/local route verification: built server on `localhost:3001` redirected `/play/tournaments` and `/play/connect4` to sign-in as expected; `/api/play/connect4-tournaments` and `/api/play/connect4` returned 401 unauthenticated instead of 404. Full authenticated teacher/student tournament UI verification was blocked by lack of an available local authenticated tournament session. `next dev` on port 3000 still emitted the pre-existing `EMFILE: too many open files, watch` issue and served 404 for `/play/tournaments`, so browser verification used `next start --port 3001` after a successful build.
  - Delivery: implementation commit `3da1808` and follow-up handoff commits were pushed to `origin/main`; `git ls-remote origin main` confirmed the pushed branch. Vercel connector did not expose a deployment ID and only recommended the Git push path. Live route checks after push: `https://www.mathclaw.com/play/tournaments` returned 307 to sign-in and `https://www.mathclaw.com/api/play/connect4-tournaments` returned 401 unauthenticated, confirming the deployed protected route/API remain reachable.
  - Remaining caveat: production Tournament Mode still requires `supabase/migrations_20260506_connect4_tournaments.sql` to be applied before real authenticated use.

## What Was Built (2026-05-07 Session — Connect 4 tournament auto-advance)
- **Tournament Connect 4 winners/draw players now stay in flow from the game page** (`app/play/connect4/game-client.js`):
  - Finished tournament matches now show a short tournament status message for eligible players.
  - If the viewer won, the client waits briefly, polls `/api/play/connect4-tournaments?tournamentId=...`, lets the tournament API run `syncTournament()`, and opens the viewer's next active Connect 4 tournament match when one appears.
  - If the match ended in a draw, both players use the same auto-advance path into the draw replay match once the tournament sync creates it.
  - If the winner is the champion, the client shows "You won the tournament!" and stops polling instead of redirecting to a missing game.
  - Losers, teachers/viewers, and non-player observers do not auto-advance. Existing tournament rematch blocking remains intact.
  - Verification passed: `node --check app/play/connect4/game-client.js`; `node --check app/api/play/connect4-tournaments/route.js`; `node --check app/play/tournaments/tournament-client.js`; `node --test tests/connect4-tournaments.test.mjs`; `npm test`; `npm run build`; `git diff --check`.
  - Local browser/API verification: dev server initially reproduced the prior local 404 problem while emitting `EMFILE: too many open files, watch`; after restarting the server, `/play/connect4` redirected to sign-in as expected and `/api/play/connect4-tournaments` returned 401 unauthenticated instead of 404. In-app browser reached the sign-in page with no console errors.
  - Delivery: code commit `a2987ef` was pushed to `origin/main`; live `https://www.mathclaw.com/play/connect4` returned 307 to sign-in and live `https://www.mathclaw.com/api/play/connect4-tournaments` returned 401 unauthenticated. Vercel connector could not list projects for this account, so no deployment ID was available.
  - Remaining caveat: authenticated multi-student tournament browser verification was blocked by lack of an available local authenticated teacher/student tournament session. Production Tournament Mode still requires `supabase/migrations_20260506_connect4_tournaments.sql` to be applied before real authenticated use.

## What Was Built (2026-05-07 Session — Connect 4 tournament rematch block)
- **Blocked regular Connect 4 rematches for tournament-created matches** (`app/play/connect4/game-client.js`, `app/api/play/connect4/route.js`, commit `8ba3fc8`, pushed to `origin/main`):
  - Client UI now treats matches with `metadata.tournamentId` or `metadata.tournamentMatchId` as tournament matches and excludes them from `canRematch`, which removes both finished-match buttons: **Play Again** and **Play Again With Same Players**.
  - The regular `/api/play/connect4` `rematch` action now rejects tournament-created matches before resetting the board, returning HTTP 400 with `{ "error": "Tournament matches cannot be replayed from Connect4." }`.
  - Tournament-engine draw replay behavior in `app/api/play/connect4-tournaments/route.js` was not changed.
  - Verification passed: `node --check app/play/connect4/game-client.js`; `node --check app/api/play/connect4/route.js`; `node --test tests/connect4-tournaments.test.mjs`; `npm run build`; `git diff --check`.
  - Browser/local API verification was blocked: the local dev server started only after network permission, but repeatedly hit `EMFILE: too many open files, watch` and served HTTP 404 for both `/` and `/play/connect4`; authenticated finished-match browser checks also require a logged-in local session and real match data.
  - Delivery checks: `git ls-remote origin main` confirmed `8ba3fc8d99f4b58b410beb3723bc5ec5b28cc147` on `main`; live `https://www.mathclaw.com/play/connect4` returned 307 to sign-in; live `POST https://www.mathclaw.com/api/play/connect4` returned 401 for unauthenticated requests, confirming the deployed API route is reachable. Vercel connector did not expose a deployment ID for this project; the connector only recommended the Git push path.

## What Was Built (2026-05-06 Session — Connect 4 Tournament Mode v1)
- **Connect 4-only Tournament Mode built and pushed** (`app/play/tournaments/*`, `app/api/play/connect4-tournaments/route.js`, `lib/student-games/connect4-tournaments.js`, `supabase/migrations_20260506_connect4_tournaments.sql`, commit `265c6ab`):
  - Added a fourth Group Activities card: **Tournaments**. For v1 it routes directly to Connect 4 tournaments; later this can become a game picker.
  - Teacher flow: open a class-scoped tournament lobby, see present students, generate a random bracket, keep the full bracket sticky at the top, and watch live games in a two-column board wall. Finished games move below newest-first.
  - Student flow: students open `/play/tournaments`, presence is tracked with the same 8-second window pattern as Double Board, and assigned games appear with a button that opens their Connect 4 match directly.
  - Bracket logic: creates a power-of-two bracket with random byes. For 9/13/29 players, only the play-in round starts first; later rounds begin automatically after earlier-round games finish. Draws create a replay for the same bracket slot.
  - Connect 4 deep links now support `/play/connect4?match=<id>` so tournament players do not type invite codes.
  - Verification: `node --check` on edited route/client files passed; `node --test tests/connect4-tournaments.test.mjs` passed; `npm test` passed (21/21); `git diff --check` passed; `npm run build` passed. Browser/local route check hit expected sign-in redirect. Live checks after push: `https://www.mathclaw.com/play/tournaments` returns 307 to sign-in; `https://www.mathclaw.com/api/play/connect4-tournaments` returns 401 instead of 404, confirming the deployed route is live.
  - **Important blocker:** Supabase MCP/Vercel MCP app connectors failed during handshakes (`https://chatgpt.com/backend-api/wham/apps` request failure). The production Supabase migration has **not** been confirmed/applied through the connector. Run `supabase/migrations_20260506_connect4_tournaments.sql` in production Supabase before using Tournament Mode with logged-in users.

## What Was Built (2026-05-06 Session — Middleware timeout hardening + auth error display)
- **Reduced middleware auth timeout and fixed `{}` error on sign-in** (`lib/supabase/middleware.js`, `app/auth/sign-in/sign-in-form.js`, `app/auth/sign-up/sign-up-form.js`, commit `ae2868f`):
  - Root cause 1: `AUTH_LOOKUP_TIMEOUT_MS` was 1500ms, matching Vercel's edge middleware wall-clock limit exactly — any overhead caused `MIDDLEWARE_INVOCATION_TIMEOUT` even on protected/auth routes after the public-page fix.
  - Root cause 2: when auth failed (e.g. during a 504), `signInError.message` came back as `"{}"` and was rendered raw in red on the sign-in page.
  - Fix 1: reduced timeout to 1000ms (500ms margin); made the timeout promise cancellable to eliminate per-request timer leak.
  - Fix 2: added `friendlyAuthError()` to both sign-in and sign-up forms — normalizes blank or `"{}"` messages to a human-readable fallback.
  - Verification: `node --check` on all edited files, `npm run build` passed.
  - Delivery: commit `ae2868f` ready to push to `origin/main` (push was pending user approval at session end).

## What Was Built (2026-05-06 Session — Group activity redirect loop)
- **Double Board ↔ Lowest Number Wins redirect ping-pong fixed** (`app/api/play/double-board/route.js`, `app/api/play/lowest-number-wins/route.js`):
  - Root cause: `groupRedirectTo` is stored on each live game session. If a teacher moved the group from Lowest Number Wins to Double Board, then later moved them back, both live sessions could retain opposite redirect instructions and polling would bounce browsers between routes.
  - Fix: each redirect action now clears a stale `groupRedirectTo` value on the destination game's active session for the same course before setting the source game's redirect. Redirect commands now also include `groupRedirectCreatedAt` and are only honored for 60 seconds; old untimestamped redirect values are ignored so already-stuck live sessions stop ping-ponging.
  - Verification: `node --check` on both edited route files, `git diff --check`, and `npm run build` passed. Build still shows the existing Next 16 middleware/proxy warning.

## What Was Built (2026-05-06 Session — Public page timeout fix)
- **Homepage/About 504 timeout fixed and shipped** (`middleware.js`, `lib/supabase/middleware.js`, `lib/site-config.js`, commit `d8bd130`, pushed to `origin/main`):
  - Root cause: production public pages `/` and `/about` were hanging on editable site-copy reads; the reported error surfaced as `504 MIDDLEWARE_INVOCATION_TIMEOUT` while public requests still ran auth middleware before rendering.
  - Fix: middleware now skips Supabase auth lookups for routes that are neither protected nor auth routes; protected/auth middleware auth lookups have a short fallback timeout; editable site-copy/feature-config reads fall back to defaults after a short timeout instead of stranding public pages.
  - Verification: `node --check` on all edited files, `git diff --check`, `npm test` (15/15), and `npm run build` passed. Build still shows the existing Next 16 middleware/proxy warning.
  - Delivery: commit `d8bd130` pushed to `origin/main`; `git ls-remote origin main` confirmed the remote branch points at `d8bd130`. Live checks after Vercel deployment: `https://www.mathclaw.com/` returned HTTP 200 in ~1.7s, `/about` returned HTTP 200 in ~1.7s, `/play` returned 307 to sign-in, and `/auth/sign-in` returned HTTP 200.

## What Was Built (2026-05-05 Session — Double Board percent multiple-choice distractors)
- **Double Board Percent Change Multiplier multiple-choice answers fixed** (`lib/question-engine/double-board.js`, `tests/double-board-multiple-choice.test.mjs`):
  - Root cause: the hundredths percent-multiplier branch mixed scaled stored answers with unscaled decimal values, which produced weak or duplicate-looking choices such as `0.00`, `0.01`, `0.01`, `1.94`.
  - Fix: percent-multiplier multiple choice now always builds four unique scaled choices: the correct multiplier, the opposite-operation multiplier, the decimal version of the percent, and one random valid decimal multiplier in the same answer scale.
  - Covered both whole-percent (`multiplier_hundredths`) and decimal-percent (`multiplier_tenthousandths`) questions, while leaving integer-operation distractors unchanged.
  - Verification: `node --test tests/double-board-multiple-choice.test.mjs`, `npm test` (15/15), `git diff --check`, and `npm run build` all passed. Build still shows the existing Next 16 middleware/proxy warning.
  - Delivery: commit `f072ff2` (`Fix Double Board percent choices`) pushed to `origin/main`; `git ls-remote origin main` confirmed the remote branch points at `f072ff2`; `https://www.mathclaw.com` returned HTTP 200 from Vercel.
  - Localhost note: port 3000 was occupied by a `node` process but did not respond to `curl`; per startup convention, no restart was attempted without user approval.

## What Was Built (2026-05-05 Session — Double Board teacher turn exclusion)
- **Double Board teacher included in one-at-a-time turn rotation fixed** (`app/api/play/double-board/route.js`, commit `56474fe`, pushed to `origin/main`):
  - Root cause: `buildTurnEligiblePlayers` builds the eligible list from `student_course_memberships`. If the host teacher's profile_id is in that table for their own course, they get a synthetic entry with `role: "student"` and land in the rotation. No guard previously stripped `host_teacher_id` from the eligible list.
  - Fix 1: `buildTurnEligiblePlayers` now accepts a `hostTeacherId` parameter and filters that ID out of `classMemberIds` before building the list.
  - Fix 2: `loadClassTurnContext` extracts `session.host_teacher_id` and passes it to `buildTurnEligiblePlayers`; also filters the no-course-id path through `getStudentTurnOrder(...).filter(...)`.
  - Fix 3: `ensurePlayer` never demotes an existing `role: "teacher"` player to `"student"` on upsert, guarding against edge cases where `canManage` resolves late and the caller passes `"student"` as the role.

## What Was Built (2026-05-05 Session — Double Board until_wrong fix)
- **Double Board until_wrong turn-advance bug fixed and shipped** (`app/api/play/double-board/route.js`, commit `ef6c251`, pushed to `origin/main`):
  - Root cause: `buildSessionMetadata` used `parseFutureTime` for `turnPhaseEndsAt`, which returns `null` for any past timestamp. When a phase timer expired, the reconcile function saw `turnPhaseEndsAt = null` and mistook an expired timer for a missing timer, calling `startCurrentTurnSelection` (giving the same student a fresh timer) instead of `advanceTurn`.
  - Fix: added `parseAnyTime` helper (validates ISO format, no future requirement) and swapped it in for `turnPhaseEndsAt` in `buildSessionMetadata`. `parseFutureTime` unchanged everywhere else (start countdown, claim expiry).
  - Affects both failure modes the teacher reported: wrong-answer submissions where the timer had already expired before the POST landed (reconcile reset same student's turn), and straight timer-expiry (reconcile never advanced).

## What Was Built (2026-05-05 Session — Brain refactor)
- **Brain split into shared core + model-specific overlays** (commit `a3749c4`, pushed to `origin/main`):
  - Created `brain/model_workflows/codex.md`: Codex startup checklist, tool/connector/browser/deployment workflow, always-on coordination rules.
  - Created `brain/model_workflows/claude.md`: Claude Code startup checklist, operating strengths, verification approach, always-on coordination rules.
  - Created `brain/model_workflows/coordination.md`: multi-agent ownership protocol, Active File Ownership lifecycle, Claude→Codex LU handoff format, Codex→Claude critique handoff format, conflict handling.
  - `START_HERE.md` now routes: shared base files → model overlay → optional coordination.md → feature context. Added three reusable startup prompts (Codex, Claude Code, Multi-Agent). Removed unconditional `codex_workflows.md` load and dev server check from shared startup.
  - `conventions.md`: replaced Codex Operating Convention with model-neutral Verification Convention; updated LU prompt format to include model overlay instruction.
  - `architecture.md`: neutralized "Browser verification" to "User-facing verification with model overlay reference."
  - `session_handoff.md`: added Active File Ownership section; pruned older "What Was Built" entries to `history.md`.
  - `.gitignore`: added `.claude/projects/` and `.claude/worktrees/`.
  - Docs-only; no app code changed.

### Attention Allocation (2026-05-05 through 2026-06-09)
- `Announcements/Assignments/Profile Calendar` — `heavy` — shipped (assignment rules, overrides, skips, previews, marking period rules, teacher absences, grace days; 2026-06-07 through 2026-06-09)
- `Class Plan / Pacing` — `heavy` — shipped (lesson slots, grace day, bulk calendar edit, AB sequencing fixes, one-button Update Schedule; 2026-06-05 through 2026-06-08)
- `Projector` — `heavy` — shipped (Party v1, Library, Scenes/folders, question builder, LaTeX/media polish; 2026-06-01 through 2026-06-04)
- `Connect 4 Tournaments` — `heavy` — shipped (v1, best-of-3, auto-advance, replay; 2026-05-06 through 2026-05-13)
- `Double Board` — `medium` — bugfixes (turn rotation, until_wrong, percent distractors; 2026-05-05 through 2026-05-06)
- `Infra/Middleware` — `medium` — bugfix (public page 504 timeout, auth error display; 2026-05-06)
- `Dashboard/Classes merge` — `medium` — shipped (2026-06-08 era)
- `Brain/Docs` — `light` — model overlays refactor (2026-05-05)
