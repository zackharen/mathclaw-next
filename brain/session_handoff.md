# Session Handoff

Read this file FIRST in future AI sessions before doing any work.

This file represents the **current state only**. It should stay short enough to be loaded in every new session without cost. When a session ends:
1. Move the prior "What Was Built" entries to `/brain/history.md` under a dated heading.
2. Rewrite "Current State Of The Project" to reflect *now*, not a log.
3. Prune obsolete items from "Next Recommended Steps" and "Known Issues."

## Last Updated
2026-04-28 America/New_York (local-only Admin iteration interrupted)

## What Was Built (Current Session)
- **Local-only workflow change from user:** keep upcoming changes on `localhost:3000`; do not push live until the user explicitly asks to make them live.
- Local-only header chip update: top-left role chip now says `Player Mode`, `Student Mode`, `Teacher Mode`, or `Admin Mode`; Admin wins when `canAccessAdminArea(user)` is true because Admin is an access flag layered over the normal account type. Chip colors now use navy shades from lightest Player to darkest Admin. Files: `app/layout.js`, `app/globals.css`. Not pushed live yet.
- Local-only Admin page iteration: moved `Admin Sections` directly under the account count cards; added `Feature Rollout Controls` and `Editable Site Copy` as their own switcher buttons/views; moved `School Snapshot` into the `User Information` view so the switcher controls everything below it; feature/site-copy saves now return to their matching view. Not pushed live yet.
- Local dev server issue: `localhost:3000` became wedged after an invalid Admin JSX compile and then a Next/Turbopack restart. Current listener check shows PID `67492` on port 3000, but `curl http://localhost:3000/` cannot connect. Previous attempts to kill Node from the sandbox were blocked with `Operation not permitted`; user can kill it from Terminal with `kill 67492`. After killing it, next session should clear/rename stale `.next` dev cache if needed and restart `npm run dev`.
- Added the homepage MathClaw square logo (`public/mathclaw-logo.png`) to the top of `/about`, centered above the two About cells with responsive sizing
- Updated `/about` to show two side-by-side Admin-backed cells only: "About Us" uses `siteCopy.aboutStory`, and "Mission Statement" uses `siteCopy.missionStatement`; the lower "Where It Fits" cell was removed
- Added an `aboutGrid` style so the two About page cells stretch to matching heights on desktop and stack on mobile
- Updated Admin → Editable Site Copy wording so the editable about text is labeled "About Us text"; the existing hidden `about_title` value is preserved during saves
- Simplified homepage: stripped all user-type-specific sections; now shows only a banner (if set) and an `<h1>` welcome heading
- Added `homeWelcome` field to site copy system (`lib/site-config.js`, `app/admin/actions.js`, `app/admin/page.js`); default is "Welcome to Mathclaw!"; editable from admin diagnostics panel under "Editable Site Copy"
- Added MathClaw square logo (`public/mathclaw-logo.png`) to the homepage above the welcome heading
- Replaced nav brand text with horizontal MathClaw logo image (`public/mathclaw-logo-nav.png`) — acts as home button, scales responsively via `clamp` height; iterated to transparent-background wider-crop final version
- Fixed Vercel build failure: `lib/integer-practice/mastery-settings.js` and `mastery-settings.server.js` were untracked locally and never committed, breaking all production builds

## Current State Of The Project
- Three account types live in production: `teacher`, `student`, `player` (see `conventions.md` -> Account Types)
- The global site shell now uses full-page width instead of the older narrow 1180px cap, while still keeping responsive outer padding
- The nav brand area shows the horizontal MathClaw logo (`public/mathclaw-logo-nav.png`) as a home-page link; scales responsively by height via `clamp`
- The homepage (`app/page.js`) is intentionally minimal: banner (if set) + `homeWelcome` heading + MathClaw square logo. User-type-specific widgets will be added incrementally. The welcome text is editable from admin → Editable Site Copy.
- The `/about` page shows the centered square MathClaw logo above two cells only: "About Us" from Admin `About Us text` / `aboutStory`, and "Mission Statement" from Admin `Mission statement` / `missionStatement`; the cells match height on desktop and stack on mobile.
- Header chip local work in progress: role chip labels are `Player Mode`, `Student Mode`, `Teacher Mode`, `Admin Mode`, with Admin determined by admin access rather than `account_type`; navy shade variants live in `app/globals.css`. This is local only until the user asks to push live.
- Admin page local work in progress: `Admin Sections` now sits below the count summary and has four views (`accounts`, `diagnostics`, `features`, `site-copy`). `accounts` should show School Snapshot + User Information below the switcher; `diagnostics` should show Integer Mastery Dashboard, Performance Spend/App Decision, Internal Error Log, and Bug Inbox; `features` should show Feature Rollout Controls; `site-copy` should show Editable Site Copy. This is local only until the user asks to push live.
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

## What Was Built (2026-04-28 Morning Session)
- Fixed `/teachers` page showing student accounts: added `.eq("account_type", "teacher")` to the primary `profiles` query in `app/teachers/page.js`
- Fixed `/teachers` page showing soft-deleted accounts: cross-referenced profiles against `auth.admin.listUsers`, filtering `app_metadata.account_deleted = true`
- Ran SQL to clean orphaned profile rows: set `discoverable = false` for profiles with no matching auth user
- Alphabetized nav items; Log Out hardcoded last
- Committed `app/components/GameReadyBanner.js` which was untracked and silently breaking all Vercel production builds
- Reverted invalid `eslint.ignoreDuringBuilds` key from `next.config.mjs` (not supported in Next.js 16)

## Active Tasks
- Continue local-only Admin page/layout optimization after fixing `localhost:3000`.
- Current local dev blocker: port 3000 has stuck Node PID `67492`, but localhost is not responding. User may need to run `kill 67492`; then restart `npm run dev` from `/Users/zackarenstein/mathclaw-next`. If the dev server serves 404 for all routes after restart, rename or clear `.next` dev cache before starting again.

## Migrations Or Policy Changes Made
- Created `/supabase/migrations_20260427_double_board_decimal_percents.sql`; it must be applied to Supabase before decimal Percent Change Multipliers Column 3 questions can be stored in live sessions.
- Restored `/supabase/migrations_20260424_open_middle.sql`; user applied it successfully in Supabase SQL Editor on 2026-04-28 after running `drop policy if exists ...` cleanup for the pre-existing Open Middle/school policies.
- Brain policy changed: future coding sessions should load `coding_agent_principles.md` from `START_HERE.md` and use its checklists before editing and before final response.
- Brain workflow changed: future sessions should check `localhost:3000` during startup, activate the dev server with `npm run dev` only when port 3000 is free, and ask before restarting or changing ports when port 3000 is occupied but unhealthy.
- Brain docs changed: `future_ideas.md` is now the lightweight future ideas / todo bank and should be loaded only when the user asks for future ideas, backlog, roadmap candidates, todo items, or to reference the bank.

## Next Recommended Steps
Prune completed items from this list when rewriting this file. Order is rough priority.

1. **Fix local dev server first** - kill PID `67492` if still present, rename/clear stale `.next` if routes still 404, restart `npm run dev`, and verify `/`, `/about`, `/admin`, `/admin?view=accounts`, `/admin?view=diagnostics`, `/admin?view=features`, and `/admin?view=site-copy`.
2. Verify Admin local views in the browser while logged in as owner/admin. Everything above `Admin Sections` should remain visible; everything below should change based on the selected button.
3. Keep all further site-optimization work local on `localhost:3000`; do not push until the user explicitly asks to make changes live.
4. **Run `migrations_20260426_lowest_number_wins.sql` in production Supabase** - paste the file into the SQL editor; it's short and won't hit the paste limit. Required before teacher can test Lowest Number Wins with class tomorrow.
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
- Then the relevant `/brain/feature_context/*.md` files for the task

Load only when scope requires:
- `/Users/zackarenstein/mathclaw-next/CHATGPT_CONTEXT.md` - off-repo context snapshot
- `/Users/zackarenstein/mathclaw-next/brain/history.md` - past sessions, only when tracing timelines
- `/Users/zackarenstein/mathclaw-next/brain/features.md` - broad catalog, reference-only
- `/Users/zackarenstein/mathclaw-next/brain/current_priorities.md` - broad roadmap, reference-only
- `/Users/zackarenstein/mathclaw-next/brain/future_ideas.md` - future ideas / todo bank; load when asked about backlog, roadmap candidates, todo items, or to reference the ideas bank

## Known Issues / Bugs
- **Local dev server currently wedged** - PID `67492` is listening on port 3000 but `localhost:3000` is not responding. If this persists in the next session, ask the user to run `kill 67492`, then restart the dev server. If Next serves 404 for all routes after restart even though `app/page.js` exists, rename/clear `.next` dev cache and restart.
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
- Several startup files referenced by `START_HERE.md` and the handoff (`project_overview.md`, `architecture.md`, `file_map.md`, and `feature_context/INDEX.md`) are not present in the current `/brain` folder snapshot.
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
