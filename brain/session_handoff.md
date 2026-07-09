# Session Handoff

Read this file FIRST in future AI sessions before doing any work.

This file represents the **current state only**. It should stay short enough to be loaded in every new session without cost. When a session ends:
1. Move the prior "What Was Built" entries to `/brain/history.md` under a dated heading.
2. Rewrite "Current State Of The Project" to reflect *now*, not a log.
3. Prune obsolete items from "Next Recommended Steps" and "Known Issues."

## Last Updated
2026-07-08 America/New_York (Projector Scene Workshop sidebar polish)

## What Changed (2026-07-08 Session - Projector Scene Workshop Sidebar)

- `app/projector/projector-scene-workshop.js` now renders the Workshop left rail as collapsible sections, with `Upload Pool` moved above `Edit Existing Scene` and `Saved Items`.
- `app/projector/styles.css` adds the matching section header/toggle styling while preserving the existing Workshop visual language.
- Verification: `node --check app/projector/projector-scene-workshop.js`, targeted `npx eslint app/projector/projector-scene-workshop.js` (0 errors, existing `<img>` warnings only), `git diff --check`, and `npm run build` all passed.
- Shipped to `origin/main` at `af0af5f` (`Polish projector scene workshop sidebar`); `https://www.mathclaw.com/projector` responds from Vercel with the expected unauthenticated 307 redirect to `/auth/sign-in?redirect=/projector`, and `/` responds 200.
- Local browser QA limitation: the dev server starts, but route rendering is blocked in this checkout by missing Supabase URL/key env vars, and the dev watcher logs `EMFILE: too many open files` warnings.
- Deployment status limitation: Vercel connector still returns 403 for `zack-arensteins-projects`, so deployment ID/readiness could not be read directly from the connector.

## What Was Built (2026-06-10 Session — Assignments, marking periods, and announcement generation)

- **`{day_number}` now uses the school-wide day sequence in every generation path** (`lib/announcements/assignment-rules.js`, `app/classes/[id]/announcements/actions.js`, `app/onboarding/profile/page.js`; commit `3f0df8d`): new shared `buildSchoolWideDayNumberByDate` walks every weekday in the school year and skips only days marked `off` in `school_calendar_days` — same logic as the Profile and Class Plan pages. `generateAnnouncementsForCourse` (the single engine behind calendar updates, the announcements action, and profile saves) fetches the teacher's `school_calendar_days` and uses the school-wide map, falling back to course-calendar numbering only when course school-year dates are missing. Profile rule previews use the page's school-wide map. Per-class calendar edits and A/B scoping no longer shift announcement day numbers or marking-period placement.
- **"Due that day anyway" (`same_day`) no-meeting option** (`announcement-assignment-rule-form.js`, `actions.js`, `assignment-rules.js`; commit `3410112`): weekly and marking-period rules can keep occurrences on the generated date when it is any non-off school day, even if the class doesn't meet — announcements already generate for all non-off days, so the line displays.
- **Optional Start Date on assignment rules** (commit `af12728`): stored as `settings.start_date` (JSON, no migration). Occurrences before it are skipped, the every-N-weeks cycle anchors to it, and times-per-marking-period counts redistribute evenly across the remaining days of each period. Rule summaries show ", starting M/D".
- **Optional due dates on assignment rules** (commit `5a5aeb8`): "Due After (school days, optional)" field (1-60) stored as `settings.due_school_days`. The due date walks N non-off school days past the assignment date, follows rescheduled override dates, and is omitted when it would fall past the calendar end. Announcement lines render "Label | Due M/D". Zack chose school-days-after semantics over calendar-days/next-occurrence.
- **180-day year accounting in Marking Periods** (commit `f96fef9`): the section shows the final marking period day target (max `end_day_number` of saved rules, default 180), the date Day #target lands on, a bold shortfall warning when the calendar has fewer school days, and a count of school days falling after the target outside all marking periods (with a hint to mark breaks as Off). Period cards say "beyond the calendar (Day #N is not scheduled)". Zack reviewed and approved.
- **Profile UI formatting per Zack's live feedback** (commits `aedd34b`, `7247c36`, `e8394e6`, `d8c0298`, `01faac5`, `1322c91`): the Generated Schedule Preview header/rows share an `.assignmentPreviewGrid` class with fixed content-sized centered columns and `width: fit-content` (no more full-screen stretch); the Classes column width comes from `--classes-col` computed from the teacher's longest course label so the open Classes menu shows each class on one line (dropdown card `max-content`, labels `nowrap`); the Profile School Calendar table got the same compact centered treatment (`9.5rem 3.5rem 2.5rem 2.5rem 8.5rem 11rem 11rem` + `fit-content`); buttons renamed to "Save Assignment" / "Update Assignment"; the save status note sits in a `ctaRow` for normal spacing. Mobile keeps full-width single-column rows.
- **Production migration audit via Supabase MCP**: tracked list confirms `grace_day_type_all_tables` (20260608154050) and `profile_nicknames` (20260608145135) applied 2026-06-08; information_schema confirms `lowest_number_wins_*`, `connect4_tournament*`, and `open_middle_*` tables all exist in production. Stale "run this migration" steps pruned below.
- Verification per change: `node --check`, `git diff --check`, `npm run build`, plus focused Node logic tests (school-wide numbering, same_day across class types, start date across all three cadences, due dates including off-day skip / override follow / past-calendar-end null). Every commit pushed to `origin/main` with the Vercel deployment confirmed via GitHub commit status, and live routes spot-checked.
- Note: commit `01e8494` ("Shift assignment dates to nearest meeting day for A/B-only classes") shipped from another session after the prior handoff update and was not previously documented here.

## Current State For Fresh Chat
- **The announcement system now covers Zack's target format end to end.** Default editable template: `Day #{day_number} | {date} | {ab_day} | {schedule_type}` plus `{lesson_title}`, `{objective}`, `{standards}`, `{assignments}`, `{teacher_absences}` (and `{class_name}`, `{day_type}`, `{reason}`, `{day_of_week}`, `{do_now}`, `{quote}`, `{regular_assignment}`). `{day_number}` is the school-wide day sequence. Example target output:
  ```
  Day #18 | Friday, 9/26/2025 | B Day | Full Day Schedule
  2.01: Planning a Pizza Party
  Let's write expressions to estimate the cost of a pizza party.
  *Insert standards here*
  Delta Math Spiral Review | 1.4 | Due 10/2/2025
  Notebook Check | 10/3/2025
  I won't be in school on the following dates: 10/2
  ```
- **Assignment rules (Profile → School Calendar → Announcement Assignments)**: per-rule label, class scope (all/one), cadence (every N weeks with weekday checkboxes / monthly day-of-month with before-after shift / N times per marking period with optional weekday filter), optional start date, optional due-after-N-school-days, and a no-meeting shift (`before`/`after`/`same_day`/`skip`). Saved rule cards show grouped Generated Schedule Previews with per-occurrence reschedule overrides (`teacher_announcement_assignment_rule_overrides`) and per-class skips (`announcement_assignment_override_skips`) via the Classes menu. `generateAnnouncementsForCourse` in `app/classes/[id]/announcements/actions.js` is the single generation engine; `lib/announcements/assignment-rules.js` owns occurrence logic.
- **Marking periods**: school-day-number rules in `teacher_marking_period_rules` with a "Use 4 Standard Quarters" shortcut (Days #1-45/46-90/91-135/136-180). The Profile section shows 180-day accounting: target day, landing date, shortfall warning, extra-days note. Quarter dates recalculate from the live calendar every render. **Remaining**: Zack should mark his real district holidays/breaks as Off days, then confirm Day #180 lands near the real year end (6/16/2027).
- **Remaining work in this area is live-use polish only**: wording/spacing tweaks as Zack tests in his signed-in browser (he verified today's changes via screenshots in-session). New announcements pick up corrected day numbers on the next regeneration — any schedule update or Profile calendar save regenerates all owned courses.
- **Profile School Calendar facts**: production profile has `school_year_start = 2026-09-02`, `school_year_end = 2027-06-16`; saves and display both work; `grace_day` is live in both `school_calendar_days` and `course_calendar_days`; Teacher Out checkboxes use it (school day number still counts, no lesson assigned).
- **Class Plan page shape**: top card has title/subtitle + Arcade Suggestions toggle; Modify Calendar holds date range, pacing mode, Modified Day Rules, AB schedule, bulk editor with Apply-to-all-classes, Copy Calendar to Other Classes, and one Update Schedule button; stats card shows Class Days, Full Days, Library Lessons, Planned Lessons, Generated Announcements, Projected Final Lesson Date; lesson cards show marking period + school Day# subtitles.
- Working tree was clean at session end; no unrelated uncommitted changes remain (.claude/settings.json and future_ideas.md notes from earlier sessions are obsolete).

## Current State Of The Project
- Three account types live in production: `teacher`, `student`, `player` (see `conventions.md` -> Account Types)
- The global site shell now uses full-page width instead of the older narrow 1180px cap, while still keeping responsive outer padding
- The nav brand area shows the horizontal MathClaw logo (`public/mathclaw-logo-nav.png`) as a home-page link; scales responsively by height via `clamp`
- The homepage (`app/page.js`) is intentionally minimal: banner (if set) + `homeWelcome` heading + MathClaw square logo. User-type-specific widgets will be added incrementally. The welcome text is editable from admin → Editable Site Copy.
- The `/about` page shows the centered square MathClaw logo above two cells only: "About Us" from Admin `About Us text` / `aboutStory`, and "Mission Statement" from Admin `Mission statement` / `missionStatement`; the cells match height on desktop and stack on mobile.
- Admin page is live: `Admin Sections` sits below the count summary and has five alphabetized views. `accounts` → collapsed School Snapshot + collapsed User Information; `diagnostics` → collapsed Traffic & App Usage, collapsed Internal Error Log, collapsed Bug Reports; `features` → Feature Rollout Controls with grouped admin disclosure formatting, alphabetical/status sorting, short rollout labels, navy shade status chips, and editable Admin copy fields; `site-copy` → Editable Site Copy; `mastery` → Mastery Settings (cross-game adaptive progression rules + simulator). `/admin` default for owner/admin users is Bugs and Internal Errors.
- The `/play` page now collapses its main content blocks behind matching disclosure headers, with feedback sections opening automatically when needed; section order is Classes, Group Activities, Fun & Games, Awards & Extra Credit, Create A Math Question
- Group Activities is a direct 3-column card grid on `/play` with Double Board, Lowest Number Wins, and Open Middle
- Tournament Mode v1 is live as a fourth Group Activities option and currently supports Connect 4 only; its production tables exist (confirmed 2026-06-10), so it is unblocked for authenticated playtesting.
- Fun & Games has three equal-width columns: `#arcade`, `#mathskills`, and `#survivalskills`; Locker Practice belongs under `#survivalskills`
- Open Middle is in code at `/play/open-middle`, appears under Group Activities, and its Supabase schema/policies were applied successfully in the active Supabase project via SQL Editor
- `/play/locker-practice` is live on `main`; dial movement, validation, and visual model are all consistent
- `/play/lowest-number-wins` is live on `main`; its production tables (`lowest_number_wins_sessions`, `_players`, `_picks`) exist (confirmed 2026-06-10), so it is unblocked for authenticated playtesting
- Lowest Number Wins uses kebab-case for the actual Next route (`/play/lowest-number-wins`) and keeps a legacy underscore redirect (`/play/lowest_number_wins`) for catalog/old-link compatibility
- Teacher workspace and student arcade are both active, real surfaces; class creation defaults to no-curriculum; curriculum opt-in
- Arcade supports both `student` (class required) and `player` (class optional) entry paths
- Integer Practice is a large adaptive system with its own progression engine, Node tests, owner-managed global mastery tuning, and compact aggregate saved progress
- Double Board supports integer operations, percent-change multipliers, and Mixed Review, with a live classroom flow including turn reordering, student-voted settings, per-student lockouts, score-sorted class roster ranking, roster presence colors, synced timers, teacher next-student control, podium end-state, and projector fullscreen. Percent Change Multipliers Column 3 uses 2-decimal percents and ten-thousandths answer scaling.
- Projector Party is in code at `/projector` for teachers and `/projector/screen` for public display screens. It uses Supabase Realtime Broadcast over `projector-session-<sessionId>` and stores non-sensitive screen states in `projector_sessions`. Projector supports text/LaTeX/image/video sending, screen-recording upload conversion to projector-friendly MP4, fullscreen receiver controls, and full-viewport image/video display on live screens. LaTeX content preserves typed whitespace through send/save flows; literal newlines render as stacked display rows; unescaped `%` displays as a percent sign instead of becoming a comment; standalone `^`/`↑` render as an up arrow while normal exponent syntax remains available; typed spaces around up/down arrows render as visible LaTeX spacing. The LaTeX composer has helper buttons for fraction, square root, up arrow, and down arrow insertion. LaTeX/image/video composer modes can include optional plain `Top Text` above the content; this top text persists in live screen states and Scenes. Public projector screens and dashboard previews use smaller top text and contain media inside the remaining space so images remain fully visible. The teacher dashboard has collapsible **Screen Selection**, **Scenes**, **Saved Items**, and **Rooms** panels; Screen Selection is open by default and includes screen targeting, content type tabs, the composer (inputs + preview), and Send/Clear/message. Scenes, Items, and Rooms launcher headers use centered title/count styling. Rooms supports teacher-managed room profiles with 1-12 ordered screen slots, active-room selection, and the default four-screen room fallback. Each dashboard screen card has an `Edit` button that loads that screen's content back into the composer for editing/resending. Rotate controls support both `↶ Rotate Left` and `↷ Rotate Right`. The **Saved Items** library supports category tagging (`Questions`, `Activities`, `Word Walls`, `Data Walls`, `News`, `Announcements`), client-side search, category filter pills, and inline rename per item. Saved video/GIF thumbnails are static in the tiny saved lists but still play in live screen previews. The **Scenes** panel (formerly Room Setups) saves/restores full four-screen arrangements; folders are collapsible sections (all closed by default) with a small "D" delete button and a "+ New Folder" form at the bottom. Screen URLs use the readable format `mathclaw.com/projector/screen/<pin>/<screenNumber>`; old `?token=` URLs still work. Projector screen receiver is locked to viewport height — images and videos never require scrolling. Production Supabase migrations `projector_library_items`, `projector_scene_library_items`, `projector_scene_folders`, `projector_library_category`, and `projector_room_profiles` were applied successfully.
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
- Created `/supabase/migrations_20260629_projector_room_profiles.sql` and applied it to production Supabase project `mathclaw-prod` (`ruaaznacaywngewxyged`) on 2026-07-01 via the Supabase connector as migration `projector_room_profiles` (version `20260701140133`). Verification confirmed `public.projector_room_profiles` exists.
- Created `/supabase/migrations_20260605_grace_day_type.sql`. Applied to production on 2026-06-08 as `grace_day_type_all_tables` (version `20260608154050`), covering both `school_calendar_days` and `course_calendar_days`.
- Created `/supabase/migrations_20260601_projector_sessions.sql` and applied it to production Supabase project `mathclaw-prod` (`ruaaznacaywngewxyged`) on 2026-06-01 via the Supabase connector. The apply call returned `success: true`; follow-up migration listing was blocked by connector reauthentication.
- Created `/supabase/migrations_20260601_projector_library_items.sql` and applied it to production Supabase project `mathclaw-prod` (`ruaaznacaywngewxyged`) on 2026-06-01 via the Supabase connector. The apply call returned `success: true`; migration list verification showed `projector_library_items` at version `20260602000202`.
- Created `/supabase/migrations_20260602_projector_scene_library_items.sql` and applied it to production Supabase project `mathclaw-prod` (`ruaaznacaywngewxyged`) on 2026-06-02 via the Supabase connector. The apply call returned `success: true`; migration list verification showed `projector_scene_library_items` at version `20260602134120`.
- Created `/supabase/migrations_20260602_projector_scene_folders.sql` and applied it to production Supabase project `mathclaw-prod` (`ruaaznacaywngewxyged`) on 2026-06-02 via the Supabase connector. The apply call returned `success: true`; migration list verification showed `projector_scene_folders` at version `20260602141846`.
- Created `/supabase/migrations_20260427_double_board_decimal_percents.sql`; it must be applied to Supabase before decimal Percent Change Multipliers Column 3 questions can be stored in live sessions.
- Created `/supabase/migrations_20260506_connect4_tournaments.sql`. Confirmed applied: production tables `connect4_tournaments`, `connect4_tournament_matches`, and `connect4_tournament_participants` exist (checked 2026-06-10).
- Created `/supabase/migrations_20260513_profile_nicknames.sql`. Applied to production on 2026-06-08 as `profile_nicknames` (version `20260608145135`).
- Restored `/supabase/migrations_20260424_open_middle.sql`; user applied it successfully in Supabase SQL Editor on 2026-04-28 after running `drop policy if exists ...` cleanup for the pre-existing Open Middle/school policies.
- Brain policy changed: future coding sessions should load `coding_agent_principles.md` from `START_HERE.md` and use its checklists before editing and before final response.
- Brain workflow changed: future sessions should load the model-specific overlay from `brain/model_workflows/` (`codex.md` for Codex, `claude.md` for Claude Code) after the shared base files. Codex overlay covers connectors/plugins, browser verification, automations, subagents, review mode, skills, artifacts, and permission-aware work.
- Brain docs restored: `project_overview.md`, `architecture.md`, `file_map.md`, and `feature_context/INDEX.md` exist again in concise form.
- Brain workflow changed: the `localhost:3000` dev server check is now Codex-overlay behavior (see `brain/model_workflows/codex.md` startup checklist), not universal startup behavior. Claude Code does not run the dev server check by default.
- Brain docs changed: `future_ideas.md` is now the lightweight future ideas / todo bank and should be loaded only when the user asks for future ideas, backlog, roadmap candidates, todo items, or to reference the bank.

## Next Recommended Steps
Prune completed items from this list when rewriting this file. Order is rough priority.

1. **Projector next build: Word Walls / Data Walls** — `Word Walls` need a multi-term input that renders as a grid on the projector screen. `Data Walls` need a structured data display. The other categories (`Activities`, `News`, `Announcements`) are fine with the existing composer. Load `brain/future_ideas.md` → "Projector Classroom Display System" before implementing.
2. **Projector next build: Playlists / Timed Rotations** — group saved items or scenes into timed rotations per screen or across all screens. Load `brain/future_ideas.md` → "Projector Classroom Display System" before implementing.
3. **Confirm `migrations_20260427_double_board_decimal_percents.sql` is applied in production** before creating live Double Board percent sessions with decimal Column 3 questions. It is not in the tracked migration list (may have been applied via SQL editor) — verify rather than assume.
4. Playtest `/play/open-middle` live with teacher + student accounts; verify template creation, launch, student join, response autosave, reveal/revise, and session close.
5. Playtest `/play/lowest-number-wins` with real teacher + student accounts (production tables confirmed); verify submission count, reveal, winner, no-winner draw, next round, projector mode, and game_sessions recording.
6. Playtest Connect 4 Tournament Mode with real accounts (production tables confirmed); verify bracket generation, round advancement, best-of-3, and replay.
7. Playtest Double Board Percent Change Multipliers after step 3; verify Column 3 decimal prompts, 4-decimal typed answers, multiple choice options, score-sorted roster, vote overlay edits during polling, and simultaneous free-for-all claim behavior.
8. **Verify localhost owner login after metadata cleanup** — log in locally as `zackharen@gmail.com`, visit `/admin?view=diagnostics`, and visit `/play/integer-practice`; if 431 persists, clear stale `localhost:3000` cookies and retry.
9. Playtest `/admin?view=diagnostics` as owner and tune Integer Mastery Dashboard defaults against real play data.
10. Playtest `/play/locker-practice` on laptop keyboard, mouse/touchpad, and phone-width touch input; tune Level 6 realism if needed.
11. **Re-implement cross-user profile visibility via security definer functions** — the 3 complex profiles policies cause Postgres infinite recursion via `student_course_memberships` RLS → `courses` RLS cycle. Most important remaining security hardening item.
12. Rotate the staging `SUPABASE_SERVICE_ROLE_KEY` — pasted into chat during staging bootstrap, should be considered compromised.
13. Confirm the `staging` branch preview URL resolves, then attach `staging.mathclaw.com` and add `https://staging.mathclaw.com/auth/callback` in staging Supabase auth settings.

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
