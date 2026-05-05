# Session Handoff

Read this file FIRST in future AI sessions before doing any work.

This file represents the **current state only**. It should stay short enough to be loaded in every new session without cost. When a session ends:
1. Move the prior "What Was Built" entries to `/brain/history.md` under a dated heading.
2. Rewrite "Current State Of The Project" to reflect *now*, not a log.
3. Prune obsolete items from "Next Recommended Steps" and "Known Issues."

## Last Updated
2026-05-05 America/New_York (Double Board fixes + brain refactor to model-specific overlays)

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

## Current State Of The Project
- Three account types live in production: `teacher`, `student`, `player` (see `conventions.md` -> Account Types)
- The global site shell now uses full-page width instead of the older narrow 1180px cap, while still keeping responsive outer padding
- The nav brand area shows the horizontal MathClaw logo (`public/mathclaw-logo-nav.png`) as a home-page link; scales responsively by height via `clamp`
- The homepage (`app/page.js`) is intentionally minimal: banner (if set) + `homeWelcome` heading + MathClaw square logo. User-type-specific widgets will be added incrementally. The welcome text is editable from admin → Editable Site Copy.
- The `/about` page shows the centered square MathClaw logo above two cells only: "About Us" from Admin `About Us text` / `aboutStory`, and "Mission Statement" from Admin `Mission statement` / `missionStatement`; the cells match height on desktop and stack on mobile.
- Admin page is live: `Admin Sections` sits below the count summary and has five alphabetized views. `accounts` → collapsed School Snapshot + collapsed User Information; `diagnostics` → collapsed Traffic & App Usage, collapsed Internal Error Log, collapsed Bug Reports; `features` → Feature Rollout Controls with grouped admin disclosure formatting, alphabetical/status sorting, short rollout labels, navy shade status chips, and editable Admin copy fields; `site-copy` → Editable Site Copy; `mastery` → Mastery Settings (cross-game adaptive progression rules + simulator). `/admin` default for owner/admin users is Bugs and Internal Errors.
- The `/play` page now collapses its main content blocks behind matching disclosure headers, with feedback sections opening automatically when needed; section order is Classes, Group Activities, Fun & Games, Awards & Extra Credit, Create A Math Question
- Group Activities is a direct 3-column card grid on `/play` with Double Board, Lowest Number Wins, and Open Middle
- Fun & Games has three equal-width columns: `#arcade`, `#mathskills`, and `#survivalskills`; Locker Practice belongs under `#survivalskills`
- Open Middle is in code at `/play/open-middle`, appears under Group Activities, and its Supabase schema/policies were applied successfully in the active Supabase project via SQL Editor
- `/play/locker-practice` is live on `main`; dial movement, validation, and visual model are all consistent
- `/play/lowest-number-wins` is live on `main` and deploying; **migration `migrations_20260426_lowest_number_wins.sql` must be run in production Supabase before the game works**
- Lowest Number Wins uses kebab-case for the actual Next route (`/play/lowest-number-wins`) and keeps a legacy underscore redirect (`/play/lowest_number_wins`) for catalog/old-link compatibility
- Teacher workspace and student arcade are both active, real surfaces; class creation defaults to no-curriculum; curriculum opt-in
- Arcade supports both `student` (class required) and `player` (class optional) entry paths
- Integer Practice is a large adaptive system with its own progression engine, Node tests, owner-managed global mastery tuning, and compact aggregate saved progress
- Double Board supports integer operations, percent-change multipliers, and Mixed Review, with a live classroom flow including turn reordering, student-voted settings, per-student lockouts, score-sorted class roster ranking, roster presence colors, synced timers, teacher next-student control, podium end-state, and projector fullscreen. Percent Change Multipliers Column 3 uses 2-decimal percents and ten-thousandths answer scaling.
- Saved-state for Integer Practice and 2048 now lives in the `saved_game_progress` DB table; legacy auth-metadata `saved_games` was bulk-preserved into the DB table and removed from auth metadata
- Local dev boots on `.env.local`; staging uses `.env.staging.local` and the `staging` branch, with a separate Supabase project; `Production` and `Preview` Vercel scopes map to the corresponding Supabase projects
- Local `.env.local` owner access is set to `zackharen@gmail.com`; if the Admin nav button is missing after this change, restart the existing `localhost:3000` dev server so Next reloads environment variables
- Admin has a "Clear saved game progress" control on the User Information page
- Brain now uses shared core files + model-specific overlays (`brain/model_workflows/codex.md`, `brain/model_workflows/claude.md`, `brain/model_workflows/coordination.md`); `START_HERE.md` is the routing entrypoint

## Active Tasks
- None outstanding from this session.

## Active File Ownership
- None currently.

<!-- When active, use this format:
- Owner: [Claude / Codex]
- Editing: [file paths]
- Reason: [brief description]
- Other agents: inspect diff and ask Zack before editing these files
See brain/model_workflows/coordination.md for lifecycle rules.
-->

## Migrations Or Policy Changes Made
- Created `/supabase/migrations_20260427_double_board_decimal_percents.sql`; it must be applied to Supabase before decimal Percent Change Multipliers Column 3 questions can be stored in live sessions.
- Restored `/supabase/migrations_20260424_open_middle.sql`; user applied it successfully in Supabase SQL Editor on 2026-04-28 after running `drop policy if exists ...` cleanup for the pre-existing Open Middle/school policies.
- Brain policy changed: future coding sessions should load `coding_agent_principles.md` from `START_HERE.md` and use its checklists before editing and before final response.
- Brain workflow changed: future sessions should load the model-specific overlay from `brain/model_workflows/` (`codex.md` for Codex, `claude.md` for Claude Code) after the shared base files. Codex overlay covers connectors/plugins, browser verification, automations, subagents, review mode, skills, artifacts, and permission-aware work.
- Brain docs restored: `project_overview.md`, `architecture.md`, `file_map.md`, and `feature_context/INDEX.md` exist again in concise form.
- Brain workflow changed: the `localhost:3000` dev server check is now Codex-overlay behavior (see `brain/model_workflows/codex.md` startup checklist), not universal startup behavior. Claude Code does not run the dev server check by default.
- Brain docs changed: `future_ideas.md` is now the lightweight future ideas / todo bank and should be loaded only when the user asks for future ideas, backlog, roadmap candidates, todo items, or to reference the bank.

## Next Recommended Steps
Prune completed items from this list when rewriting this file. Order is rough priority.

1. **Run `migrations_20260426_lowest_number_wins.sql` in production Supabase** - required before Lowest Number Wins works with real classes.
5. **Run `migrations_20260427_double_board_decimal_percents.sql` in Supabase** before creating live Double Board percent sessions with decimal Column 3 questions.
6. Playtest `/play/open-middle` live with teacher + student accounts; verify template creation, launch, student join, response autosave, reveal/revise, and session close
7. Playtest `/play/lowest-number-wins` with real teacher + student accounts after migration is in; verify submission count, reveal, winner, no-winner draw, next round, projector mode, and game_sessions recording
8. Playtest Double Board Percent Change Multipliers with real teacher + student accounts after the decimal migration is in; verify Column 3 decimal prompts, 4-decimal typed answers, multiple choice options, score-sorted roster, vote overlay edits during polling, and simultaneous free-for-all claim behavior
9. **Verify localhost owner login after metadata cleanup** - log in locally as `zackharen@gmail.com`, visit `/admin?view=diagnostics`, and visit `/play/integer-practice`; if 431 persists, clear stale `localhost:3000` cookies/session cookies and try again
10. Playtest `/admin?view=diagnostics` as the owner and tune Integer Mastery Dashboard default values against real play data from `/play/integer-practice`
11. Playtest `/play/locker-practice` on laptop keyboard, mouse/touchpad, and phone-width touch input; tune Level 6 realism if needed
12. **Re-implement cross-user profile visibility via security definer functions** - The 3 complex profiles policies cause Postgres infinite recursion via `student_course_memberships` RLS -> `courses` RLS cycle. Fix: wrap subquery logic in `security definer` functions. Most important remaining security hardening item.
13. Rotate the staging `SUPABASE_SERVICE_ROLE_KEY` - pasted into chat during staging bootstrap, should be considered compromised
14. Confirm the `staging` branch preview URL resolves, then attach `staging.mathclaw.com` and add `https://staging.mathclaw.com/auth/callback` in staging Supabase auth settings

## Key Files To Load Next Time
Default startup path (keep minimal):
- `/Users/zackarenstein/mathclaw-next/brain/START_HERE.md`
- `/Users/zackarenstein/mathclaw-next/brain/project_overview.md`
- `/Users/zackarenstein/mathclaw-next/brain/architecture.md`
- `/Users/zackarenstein/mathclaw-next/brain/conventions.md`
- `/Users/zackarenstein/mathclaw-next/brain/coding_agent_principles.md`
- `/Users/zackarenstein/mathclaw-next/brain/file_map.md`
- `/Users/zackarenstein/mathclaw-next/brain/session_handoff.md`
- Then the model overlay: `brain/model_workflows/codex.md` (Codex) or `brain/model_workflows/claude.md` (Claude Code)
- Then the relevant `/brain/feature_context/*.md` files for the task
- Also load `brain/model_workflows/coordination.md` when the task involves multi-agent coordination or handoffs

Load only when scope requires:
- `/Users/zackarenstein/mathclaw-next/CHATGPT_CONTEXT.md` - off-repo context snapshot
- `/Users/zackarenstein/mathclaw-next/brain/history.md` - past sessions, only when tracing timelines
- `/Users/zackarenstein/mathclaw-next/brain/features.md` - broad catalog, reference-only
- `/Users/zackarenstein/mathclaw-next/brain/current_priorities.md` - broad roadmap, reference-only
- `/Users/zackarenstein/mathclaw-next/brain/future_ideas.md` - future ideas / todo bank; load when asked about backlog, roadmap candidates, todo items, or to reference the ideas bank

## Known Issues / Bugs
- **RLS cross-user profile policies not live** - The following policies were dropped from production because they cause Postgres infinite recursion (via `student_course_memberships` RLS -> `courses` RLS cycle): `profiles: classmates readable`, `profiles: co-teacher reads class members`, `profiles: teacher reads class members`, `courses: co-teacher read`, `courses: enrolled student read`. All existing app paths that need this access already use the admin client or security definer RPCs, so no user-facing feature is broken. The fix is to rewrite these as `security definer` functions.
- **`course_members` table created in production** - it exists now (created from schema.sql definition) but is empty; no co-teacher assignments have been made. All migrations from the audit session have been applied to production.
- **Locker Practice tuning** - clean release branch builds the route and fixes the dial visual/state mismatch, but Level 6 still uses a simplified approximation of real locker pass behavior and needs hands-on classroom/mobile playtesting
- **Account type metadata**: legacy teacher accounts can be missing `account_type` in auth metadata. Teacher-only gates must use an explicit teacher check *and* tolerate legacy profiles via fallbacks. Never treat "non-student" as "teacher" now that `player` exists.
- **Saved-state fallback**: auth-metadata fallback for old `saved_games.*` entries remains active in both page.js files, but all currently audited legacy `saved_games` auth metadata was bulk-preserved into `saved_game_progress` and removed from auth users. The fallback can be removed in a future cleanup after another audit confirms no `auth.users.raw_user_meta_data ? 'saved_games'` rows remain.
- **Local owner login 431**: Root cause was oversized auth metadata in the `.env.local` Supabase project. User removed `raw_user_meta_data.saved_games` for `zackharen@gmail.com`; SQL result showed `metadata_bytes = 575` and `still_has_saved_games = false`. User then audited all affected auth users, preserved legacy saved games into `saved_game_progress`, and removed `saved_games` from auth metadata for all returned users. The saved DB row was not the request-header problem: `saved_game_progress` is database-only and uses compact aggregate-first integer progress. Code now strips legacy `saved_games` during email sign-in and OAuth callback before app navigation. Remaining verification: local owner login, `/admin?view=diagnostics`, and `/play/integer-practice`.
- **Middleware convention**: still `middleware.js`; Next 16 warns about the newer `proxy` convention.
- **Lint**: pre-existing unrelated failures in `app/admin/page.js` (`Date.now()` during render) and `app/play/comet-typing/game-client.js` (hook dependency warning, unescaped apostrophe).
- **Vercel dashboard** can intermittently fail to render Deployments view even when the live app is healthy. Check the deployed URL directly before assuming an outage. Corrected env vars do not take effect until a fresh deployment is created - a deploy hook is a reliable path when the dashboard is flaky.
- **Supabase SQL editor paste limit** is unreliable for the large curriculum seed. Prefer the terminal-side upload helpers under `scripts/`.

## Risks That Remain
- Restored startup brain files are concise current-orientation docs, not full historical reconstructions of the original deleted files.
- Full owner login verification is still blocked on either user-provided credentials or saved browser credentials.
- Soft-deleted accounts (`account_deleted = true`) are now excluded from `/teachers` but other surfaces that list users should be audited for the same issue.
- Orphaned `profiles` rows (auth user deleted, profile row survives with default `account_type = 'teacher'`) can accumulate over time. The SQL cleanup ran once; consider making it a periodic maintenance task.

## Lessons Learned (2026-04-28)
- **`app/components/` was never in git** — `GameReadyBanner.js` lived only locally. Any new component added under `app/components/` must be explicitly staged; git won't warn you if it's untracked. This silently broke all Vercel production builds while local builds passed.
- **`eslint` key is invalid in `next.config.mjs` for Next.js 16** — the config option was removed. Don't add `eslint: { ignoreDuringBuilds }` there; it generates a hard warning that may fail Vercel builds. Pre-existing lint errors need to be fixed in code, not suppressed in config.
- **Teachers page had no account_type filter** — any profile with `discoverable = true` appeared regardless of role. Always filter teacher-facing user lists by both `account_type = 'teacher'` AND active auth status.
- **Soft-deleted accounts** are hidden from admin via `app_metadata.account_deleted = true` but that filter must be applied explicitly anywhere else users are listed.
- **Empty Vercel retry commits don't help diagnose failures** — go straight to the build log instead of retrying blindly.

## Notes For Future AI Sessions
- Do not touch `/Users/zackarenstein/mathclaw-next/supabase/migrations_20260331_join_course_by_code_rpc.sql` unless explicitly asked
- Production schema may be older than the repo in places - keep fallback logic intact
- Owner access is controlled by `MATHCLAW_OWNER_EMAILS`
- Keep edits modular; load only the feature files needed for the task
- Follow `/Users/zackarenstein/mathclaw-next/brain/coding_agent_principles.md`: think before coding, choose the smallest safe path, edit surgically, and verify against the stated goal
- Default delivery assumption: fix/build/change requests go live on the site unless the user explicitly says otherwise (see `conventions.md` -> Delivery Convention)
- Canonical role spec lives in `conventions.md` -> Account Types. Update that one place, not multiple files, when role behavior changes.
