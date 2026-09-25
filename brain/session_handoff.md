# Session Handoff

Read this file FIRST in future AI sessions before doing any work.

This file represents the **current state only**. It should stay short enough to be loaded in every new session without cost. When a session ends:
1. Move the prior "What Was Built" entries to `/brain/history.md` under a dated heading.
2. Rewrite "Current State Of The Project" to reflect *now*, not a log.
3. Prune obsolete items from "Next Recommended Steps" and "Known Issues."

## Last Updated
2026-09-25 America/New_York (Codex: bell-schedules migration applied; Profile/calendar and clipboard QA passed after two fixes shipped as `61ba481`; projector QA awaits a designated safe screen.)

## What Was Built (2026-09-25 — Migration and authenticated QA)

- Applied the exact `supabase/migrations/20260923120000_bell_schedules.sql` to `mathclaw-prod` (`ruaaznacaywngewxyged`) via Supabase MCP on 2026-09-24 as `bell_schedules`, version `20260924113813`. Verified both tables, RLS enabled on both, eight owner policies, authenticated CRUD grants with no anon grants, and nullable `school_calendar_days.bell_schedule_type_id`.
- Authenticated production Profile and calendar render normally. Created `Full Day Test` through Manage Bell Schedules, added `12B | AP Calculus` for 08:10–08:12 with label `QA period`, and renamed the template to `Full Day Test QA`. Today (2026-09-25), an ordinary Full day with no grace flag retained its bell schedule after Apply Calendar Changes; DB comparison showed exactly one new row and all 41 pre-existing overrides unchanged. Clearing the bell assignment and saving also passed; the calendar is now restored exactly to its pre-QA values. The template/period remain, unassigned to any date, for completing projector QA.
- Found and fixed two browser bugs: newly created/renamed/deleted bell schedule types did not refresh the server-rendered calendar choices (`router.refresh()` now runs after type mutations); image paste into blank vocabulary-card space failed because the article could not receive focus (`tabIndex={0}` now makes it focusable). Live rename QA confirmed dropdown options update without reloading the page.
- Clipboard QA PASSED in both individual class Plan and All Classes grid: real clipboard PNG pasted into Word and blank card space, preview and “Save Changes will upload it” caption, Save Changes upload, loaded image from the authenticated stored-image route, and plain text paste into Word/Definition. Verified matching Storage object and resource metadata. Used vocabulary resource `50775126-5005-4582-8b53-a6cf2c4250f2` (Algebraic Manipulation), then removed only the temporary QA attachment; original title/definition and `resource_type=none`, null storage path/MIME are restored.
- Fix commit `61ba481b5c76780c30c6696eb2fc38904ce7d1d4` pushed to `origin/main`. GitHub Vercel status SUCCESS for deployment `8tiJ3kzKyrmDq4srCCiqjfcVnm1w`; authenticated live Profile/Plan QA confirms deployed behavior at `https://www.mathclaw.com`. Targeted ESLint, `git diff --check`, and build passed for the new fixes (build emitted site-config network-fetch warnings). Did not repeat Claude's existing full test suite. Local dev could not bind port 3000 (`EPERM`). Vercel connector still returns 403 for the team; GitHub deployment status was used instead.
- Supabase security advisors flag mutable search paths on the two new timestamp trigger functions (`set_teacher_bell_schedule_types_updated_at`, `set_teacher_bell_schedule_blocks_updated_at`). They are invoker triggers that only assign `NEW.updated_at`; no RLS exposure was reported for the new tables. Advisory remains unmodified.
- **Projector safety blocker:** contrary to the original request's reference to environment notes, this handoff had no named QA screen. Production Room manager showed only Room `206`, PIN `287645`, with Smartboard (1), iPads 1–4 (2–5), Desktop 1 (6), Desktop 2 (7), all active/online. None is designated safe. No screen state, room configuration, or Autopilot was changed. Asked Zack whether to add a new `QA Browser Only` screen 8; awaiting an explicit answer. Do not treat screen 6's earlier read-only white-text check as permission to mutate it.
- **End-of-period spec discrepancy:** the original design below explicitly leaves prior screen content untouched in gaps/unassigned days; resolver returns `active:false` without clearing the carousel. The QA request expected “switch away or idle.” Flagged this difference; no unrequested behavior change made. When finishing QA, report observed retention accurately rather than claiming the carousel stops.

## What Changed (2026-09-23 Session - Bell Schedules → Automatic Vocabulary Switching by Period)

Historical implementation/spec entry: migration warnings and unverified status below describe shipping day. See the 2026-09-25 QA entry above for current status.

Zack asked for named school schedules (Full Day, Half Day, Delayed Opening,
Activity Schedule, custom ones) that designate which class meets when, tagged
onto calendar days, so the projector vocabulary carousel switches
automatically by period instead of him starting it manually. Full plan (with
the reasoning behind each design choice) is at
`/Users/zackarenstein/.claude/plans/optimized-growing-moonbeam.md` if more
detail is needed later — this entry summarizes it.

**Design decisions Zack made when asked:** per-screen opt-in (not whole-Room)
via the existing Autopilot system; exactly one block per class per schedule
type (no double periods); an unassigned day or a gap between periods does
nothing (screen keeps showing whatever it had); and the driving mechanism
reuses the existing client-driven Autopilot loop (`runAutopilotStep` in
`app/projector/projector-client.js`, a `setTimeout` loop that only runs while
`/projector` is open in some browser tab) rather than building a new
server-side cron — explicitly chosen over a "more robust but bigger lift"
alternative.

**Reused existing infrastructure instead of building parallel systems:**
`projector_room_schedule_blocks` (time range + course, keyed by weekday,
drives a manual Room-switch banner) already had the right shape for a
"period" — this plan's new tables use the same (start_time, end_time,
course_id) shape but keyed by a new *schedule type* concept instead of
weekday, feeding the *screen-level Autopilot* system instead of a Room-switch
banner. Autopilot itself already had a config + `setTimeout` runtime loop
(`normalizeAutopilotConfig`, `runAutopilotStep`) supporting
items/playlist/word_wall/clock modes — this adds a fifth mode,
`"schedule_vocabulary"`.

**New tables** (`supabase/migrations/20260923120000_bell_schedules.sql`, also
baked into `supabase/schema.sql` in the right dependency order):
`teacher_bell_schedule_types` (named templates, owner_id → profiles) and
`teacher_bell_schedule_blocks` (schedule_type_id + course_id + start_time +
end_time + optional label; `unique(schedule_type_id, course_id)` enforces
the one-block-per-class rule; overlap between different classes' blocks is
checked at the application layer, not a DB constraint). `school_calendar_days`
gets a new nullable `bell_schedule_type_id` column.

**⚠️ THIS MIGRATION IS NOT APPLIED TO PRODUCTION.** Explored this explicitly
before writing any code: no Supabase MCP connector was available this
session, the `supabase` CLI isn't installed, and `.claude/settings.json`
explicitly denies `supabase db push`/`db reset`. Every past production
migration in this project went through the Supabase MCP connector or was
pasted into the Supabase dashboard SQL editor by hand — there's no in-repo
scripted path for schema DDL. **Someone with Supabase access (Zack, or a
session with the connector) needs to run
`supabase/migrations/20260923120000_bell_schedules.sql` against
`mathclaw-prod` before this feature does anything at all.**

**The code is written to degrade safely if shipped before that migration
lands** — every query against the new tables/column uses the same "missing
table/column" tolerance pattern already established elsewhere in this
codebase (`42P01`/`42703`/`PGRST204`/`PGRST205` error codes in the API routes,
message-string matching in `onboarding/profile/actions.js`, matching how
`ab_meeting_day` and `projector_room_profiles` already handle a
not-yet-migrated column/table). Concretely: the Profile calendar's new "Bell
Schedule" dropdown column just shows "None" for every day and the save action
silently drops that field on insert; the new "Manage Bell Schedules" panel on
Profile loads to an empty state; the new "Class Schedule Vocabulary" Autopilot
mode is selectable but the resolver just returns `{active: false}` forever
(screen never changes). **This was deliberately verified by design, not by
actually testing against a database missing the migration** — I could not
create such a test environment this session; flagging that this reasoning
should be spot-checked once the migration situation is sorted, ideally before
or right after applying it.

**Where things live:**
- `app/onboarding/profile/bell-schedule-manager.js` + new actions in
  `app/api/bell-schedules/route.js` (GET list, POST
  create/rename/delete-type, create/update/delete-block, with the overlap
  check and course-ownership check server-side) — a new collapsible panel on
  Profile, right after the School Calendar section, `<details>`-based
  matching `ManageClassVocabulary`'s pattern.
- Calendar grid (`app/onboarding/profile/page.js` +
  `app/onboarding/profile/actions.js`): one new `<select>` column,
  `bell_schedule_type_id__${date}`, following the exact existing
  `reason_id__${date}` pattern. **Found and fixed a real latent bug while
  wiring this in**: `saveSchoolCalendarAction` skips writing a row entirely
  for a plain instructional day with no grace flag (`if (dayType ===
  "instructional" && !graceDay) continue;`) — which would have silently
  discarded a bell schedule assigned to an ordinary day, the single most
  common case for this feature. Fixed by also checking for a bell schedule
  ID in that skip condition.
- Runtime resolver: `app/api/projector/bell-schedule/sync/route.js` (POST
  only, since it performs a write). Takes `{screenId, courseDate, nowMinutes}`
  — date/time
  computed from the **dashboard browser's own clock**, deliberately avoiding
  any server-side timezone guesswork about the teacher's school. Resolves
  today's schedule type → active block → course → eligible vocabulary (reused
  `vocabularyForCourse`/`eligibleVocabulary`, moved the server-side vocabulary
  helpers out of `vocabulary-carousel/route.js` into a new shared
  `lib/projector/vocabulary-carousel-server.js` so both routes use one
  implementation), writes a fresh `vocabulary_carousel` screen state only when
  the active course actually changed (avoids reshuffling/re-pushing every
  ~45s tick for no reason), and returns `{active:false}` — touching nothing —
  when there's no schedule type today or no block covering right now.
- Autopilot wiring: `app/projector/projector-client.js` — new
  `"schedule_vocabulary"` mode in `normalizeAutopilotConfig`/
  `autopilotModeLabel`/the mode picker UI (no per-screen sub-config needed,
  just an enable toggle), and a new `runScheduleVocabularyStep` function
  (parallel to but distinct from `runAutopilotStep`'s existing
  step-through-a-list logic, since this mode's content is server-resolved,
  not a local rotation) on a 45-second recheck cadence.
- Pure/testable logic in `lib/bell-schedules/constants.js`
  (`findActiveBellScheduleBlock`, `blocksOverlap`, time-parsing/validation
  helpers) with `tests/bell-schedules.test.mjs` (5 new tests).

**Verification done:** targeted ESLint on every new/changed file (0
problems), full `npm test` (142/142 passing, incl. the 5 new bell-schedule
tests plus 2 new tests added to `vocabulary-carousel.test.mjs` for the
future-start clamping behavior this reuses), `npm run build` (compiles,
including `/api/bell-schedules`, `/api/projector/bell-schedule/sync`, and
`/onboarding/profile`), `git diff --check` clean. Hit `/onboarding/profile`
on the local dev server (pointed at production Supabase) and confirmed no
server error and a clean redirect to sign-in — but that only exercises the
pre-auth boundary, not the new authenticated rendering.

**Verification NOT done, in order of what matters most:**
1. **The migration has not been applied anywhere, including locally** — so
   none of this has ever actually run against a database that has the new
   tables. The graceful-degradation code paths (empty states) are exercised
   implicitly by every request against the current unmigrated production DB,
   but the "happy path" (create a schedule type, add a period, tag a
   calendar day, watch a screen switch) has never executed once.
2. No authenticated browser QA of the Profile calendar's new column or the
   Bell Schedule manager panel.
3. No authenticated browser QA of the new Autopilot mode or the receiver
   actually switching.
4. Timezone assumption: the resolver trusts the dashboard browser's local
   clock for "what date/time is it," which assumes whoever has `/projector`
   open is physically in the same timezone as the school. True for a
   classroom computer; worth knowing if Zack ever runs the dashboard
   remotely.

**SHIPPED 2026-09-23**, at Zack's explicit request, deliberately ahead of the
migration ("commit the code now anyway" — chosen over waiting or applying the
migration first, after being told the tradeoff). Committed
`bff972106a4e11b5d2f201b9992d81c4c710a6d5` on `main`, pushed to `origin/main`,
GitHub commit status confirmed Vercel deployment `state: success`. Confirmed
`https://www.mathclaw.com/` returns 200 and `https://www.mathclaw.com/onboarding/profile`
still cleanly redirects (307) post-deploy — no server errors from the new
code paths hitting the still-unmigrated database. **The feature itself does
nothing yet** — see Active Tasks below for exactly what's still needed.

## What Changed (2026-09-22 Session - Projector Receiver Top Bar Safe-Area Fix)

- Zack confirmed the Home Screen standalone-mode fix (previous entry below) works — but the receiver's own top bar (screen name badge, Draw, Fullscreen) was overlapping the iPad's real status bar (clock/battery), because `black-translucent` (chosen for a true fullscreen look) draws the status bar over the page instead of reserving space for it.
- Fixed in `app/projector/styles.css` → `.projectorScreenTopBar`: added `env(safe-area-inset-top)` to its top padding, which pushes the bar down to clear the real status bar on a device that reports a safe-area inset there. `env()` resolves to `0` anywhere that doesn't apply (an ordinary browser tab, a laptop, etc.), so this is a no-op everywhere except the standalone iPad case it's meant for. `.projectorScreenTopBar` is used in exactly one place (`screen-client.js`'s receiver header), so the change is fully scoped to the receiver.
- Verification: `git diff --check` clean; visually confirmed in the Browser pane that normal (non-standalone) rendering is byte-for-byte unaffected (env() is 0 there, screenshot matches pre-change). `npm run build` compiles. This CSS change has no testable pure logic and no Node test suite coverage applies. **Could not verify the actual overlap fix in a real iOS standalone context** — no iOS Simulator on this Mac (per prior session notes) and the Browser pane can't emulate `env(safe-area-inset-top)` as a real device would; this is inherently something only Zack's physical iPad can confirm.
- **SHIPPED 2026-09-22 (Claude)**, per Zack's "push live when ready." Ask Zack to reload the Home Screen icon (or fully close and relaunch it, since standalone-mode pages can cache aggressively) and confirm the top bar buttons are now clear of the status bar.

## What Changed (2026-09-22 Session - Projector Receiver Home Screen / Standalone Mode)

- Zack has an iPad stuck updating to iPadOS 15.8.8 that also can't open Fullscreen on the projector receiver. Root cause: iPadOS Safari never supported the page-level Fullscreen API (prefixed or not) for anything but a `<video>` element until **iPadOS 16.4** — `toggleFullscreen()` in `screen-client.js` already has a documented webkit-prefixed fallback for this (added in an earlier session) but there is no API left to fall back to below 16.4, so it correctly reports "not available" rather than actually failing. If "15.8.8" is the newest update Settings offers, that's very likely the ceiling for that iPad model (Apple keeps patching iPadOS 15.x for hardware that can't run 16+, e.g. iPad Air 2 / mini 4 / 5th-gen iPad / 1st-gen iPad Pro) — no amount of retrying the update gets it past 16.4-worthy hardware.
- Added `app/projector/screen/layout.js`, scoped to the `/projector/screen` subtree only (covers both the bare join page and the `[pin]/[screenNumber]` readable-URL route; confirmed the homepage does NOT get these tags). It sets Apple web-app metadata so a receiver **saved to the iPad Home Screen** launches standalone — no Safari toolbar/address bar at all — which is the only way to get a fullscreen-equivalent view on iPadOS below 16.4, since it doesn't depend on the JS Fullscreen API at all.
- **Caught a real gap in Next.js 16.1.4's metadata API before shipping it**: `appleWebApp: { capable: true }` only emits the modern unprefixed `mobile-web-app-capable` meta tag, not the legacy `apple-mobile-web-app-capable` one — confirmed by inspecting the actual rendered `<head>` in the browser. Old iPadOS Safari (exactly the devices this is for) only honors the legacy prefixed tag, so relying on Next's built-in field alone would have shipped a fix that silently didn't work on the target hardware. Added `metadata.other["apple-mobile-web-app-capable"] = "yes"` explicitly to guarantee it's present alongside the modern one.
- The apple-touch-icon needed no separate work — `app/apple-icon.png` already exists and Next.js applies it site-wide automatically via its file-based icon convention.
- No schema migration; no other routes touched.
- Verification: targeted ESLint (0 problems), full `npm test` (137/137 passing — this change has no testable pure logic, it's metadata), `npm run build` (compiles, both `/projector/screen` and `/projector/screen/[pin]/[screenNumber]` present), `git diff --check` clean. **Directly inspected the rendered `<head>` in the Browser pane** (not just trusting the source) and confirmed all of: `apple-mobile-web-app-capable: yes`, `mobile-web-app-capable: yes`, `apple-mobile-web-app-title: Projector`, `apple-mobile-web-app-status-bar-style: black-translucent`, `viewport-fit=cover`, and the auto-linked `apple-touch-icon` — and confirmed the homepage does NOT pick up these tags (correctly scoped).
- Verification NOT done: actually adding the URL to a real iPad's Home Screen and confirming it launches standalone with no toolbar. This is inherently something only Zack can do (needs his physical iPad) — told him the exact steps (Safari → Share → Add to Home Screen → launch from the new icon, not from Safari).
- **SHIPPED 2026-09-22 (Claude)**: committed and pushed to `main`, deploy confirmed via GitHub/Vercel commit status. Zack should try Add to Home Screen on the affected iPad and report back whether it actually goes fullscreen/toolbar-free; if it doesn't, the next thing to check is whether that iPad's Safari version is old enough to not honor even the legacy meta tag (very old iOS versions, pre-iOS 11ish, though that's unlikely to be this device given it's running iPadOS 15.x already).

## What Changed (2026-09-22 Session - Vocabulary Projector: White Text, Class Name, Scheduling)

- **Root-caused and fixed a real projector text-color bug, not just a style preference.** `app/globals.css` has a global `h1, h2, h3 { color: var(--navy) }` rule. Two receiver-side headings render as bare `<h1>` with no local color override, so that global rule silently beat the inherited white from `.projectorScreenStage`: the vocabulary carousel's word (`.projectorVocabularyCopy h1`) and the "Screen inactive" heading (`.projectorScreenInactiveState h1`). Both now get `color: inherit;` — the exact same fix pattern (with the same explanatory comment) already applied once before to `.projectorPollResultsHeader h1` for the live-poll question. Everything else on the receiver (eyebrow labels, definitions, question cards, clock, word wall, timer, captions) was already correctly white via inheritance — this was not a sweep, it was these two specific elements. **Visually confirmed live**: navigated the local dev server (pointed at production Supabase, read-only) to the real screen `https://mathclaw.com/projector/screen/287645/6` and screenshotted before/after — the word ("Two-Sided Limit" / "Zero") went from dark navy to white, matching the rest of the screen. Intentionally did NOT touch the deliberately-non-white badge colors (multiple-choice option-letter circle, "Answer" pill, timer paused/status accent) — those sit on their own light-colored chips and would become unreadable if forced white.
- The vocabulary carousel now shows which class the word is from. The API (`app/api/projector/vocabulary-carousel/route.js`) fetches the course `title` alongside the existing owner check (`assertCourse` now returns the course row instead of a bare boolean) and stores it as `courseTitle` in the carousel's screen-state content on start. The receiver widget (`app/projector/projector-screen-renderer.js`) shows `"<Class Title> Vocabulary"` as the eyebrow line instead of a bare `"Vocabulary"`; falls back to plain `"Vocabulary"` for older state written before this change (confirmed live — the real "Zero"/"Two-Sided Limit" state from before this change correctly showed the plain fallback).
- Added an optional scheduled start time to "Push Vocabulary to Projector." A new "Schedule a start time" checkbox + `<input type="time">` in the dialog lets a teacher pick a same-day time (e.g. "Start Carousel" becomes "Schedule Carousel"); the client resolves it to today's ISO timestamp via a new pure `resolveScheduledStartIso(timeOfDay, referenceDate)` in `lib/projector/vocabulary-carousel.mjs` (rejects a blank/malformed time and any time at or before now — "Choose a time later today"). The API accepts an optional `startAt` and uses it as `startedAt` instead of `now` (only validates it parses; the "must be future" rule is enforced client-side, not re-litigated server-side since network latency could legitimately put it a moment in the past by the time the request lands). The GET setup endpoint now also returns `runningStartedAt` so reopening the dialog for a class with a pending schedule shows it back (checkbox + time prefilled) instead of silently forgetting it.
- The receiver widget needed to handle "the state already switched to vocabulary_carousel, but the scheduled time hasn't arrived yet" — the existing `vocabularyCarouselIndex` helper already clamped to the first word in that case (`Math.max(0, now - start)`), but the widget rendered that first word immediately instead of a "not started yet" placeholder. It now ticks a `nowMs` clock every second (removed the old guard that skipped the interval entirely for a single-word carousel, which would have left a scheduled one-word carousel stuck forever) and shows "Starting soon" + the scheduled clock time until `now >= startedAt`, then flips over on its own with no page reload needed.
- Files touched: `app/api/projector/vocabulary-carousel/route.js`, `app/projector/projector-screen-renderer.js`, `app/projector/styles.css`, `app/classes/[id]/plan/manage-class-vocabulary.js`, `lib/projector/vocabulary-carousel.mjs` (added `resolveScheduledStartIso`), `tests/vocabulary-carousel.test.mjs` (4 new tests: future-start clamping, schedule-time resolution, past/now/malformed rejection). No schema migration; `screen_states` JSON just gained two optional keys (`courseTitle`, and `startedAt` can now be future-dated) that old readers already tolerate since the shape didn't change.
- Verification done: targeted ESLint on all 5 changed source files (0 problems), full `npm test` (137/137 passing, including the 4 new cases), `npm run build` (compiles, incl. `/classes/[id]/plan`, `/projector`, `/projector/screen`), `git diff --check` clean. The white-text fix was additionally confirmed against a real live screen as described above (read-only — no production data was written).
- Verification NOT done as of shipping (needs Codex/authenticated QA — Claude had no local sign-in session and cannot enter a password): (1) open "Push Vocabulary to Projector" for a real class, confirm the class name now appears in the dialog and, after starting, on the receiver ("<Class> Vocabulary" instead of bare "Vocabulary"); (2) check "Schedule a start time", pick a time a few minutes out, start it, confirm the receiver shows "Starting soon" + that time and then flips to rotating words on its own at that time with no reload; (3) reopen the dialog while a schedule is pending and confirm the checkbox/time reappear correctly; (4) confirm Stop Carousel and Update Carousel still behave normally on both a scheduled and an already-running carousel. Use QA screens, not real classroom hardware, for this — open Projector Rooms to confirm which screens are safe.
- **SHIPPED 2026-09-22 (Claude), unusually as Claude rather than Codex: Zack explicitly asked Claude to push this live** ("Push it now please") after being told which interactions were still unverified, overriding this project's normal default (Codex owns deployment) for this one task. Committed `adebdde12dba61b8ea2ce836d0fca9ba81ec1fca` on `main`, pushed to `origin/main`, GitHub commit status confirmed Vercel deployment `state: success` (`https://vercel.com/zack-arensteins-projects/mathclaw-next/63Wz6mGSA2aBuCGpYLJ65ZUdod5t`). Re-confirmed the white-text fix live in production post-deploy at `https://mathclaw.com/projector/screen/287645/6` (screenshotted — word rendered white, screen still rotating normally). **The class-name label, the scheduled-start flow, and the clipboard-paste interaction are live but still functionally unverified** — do the QA steps above (and the clipboard-paste QA steps in the entry below) next session, or ask Zack to spot-check.

## What Changed (2026-09-22 Session - Vocabulary Clipboard Paste)

- `Manage Class Vocabulary` word cards now accept a pasted clipboard image (Ctrl/Cmd+V) anywhere in the card — including while the Word or Definition field has focus — without opening the file picker. A pasted JPG, PNG, WebP, or GIF runs through the exact same `validateLessonVocabularyImage`/`uploadLessonVocabularyImage` path as the existing file input, so Save Changes uploads it identically either way. Plain text paste into Word/Definition is untouched — the paste handler only intercepts clipboard items whose `kind` is `"file"` and whose type starts with `image/`; anything else falls through to normal browser paste.
- Added a live object-URL image preview (with a "Save Changes will upload it" caption) for a newly chosen or pasted image, shown in the card's media pane in place of the existing attachment while pending; the object URL is revoked on every image change and on unmount. This preview did not exist before — file-picker selections previously only showed a filename.
- A pasted image with no filename (or the generic name some browsers supply) gets one generated from its MIME type via a new `buildClipboardImageFileName` helper in `lib/lesson-resources/constants.js` (exported, not component-local, so it's plain-JS and Node-test-importable — the component file is JSX and can't be imported by `node --test`).
- The existing file picker, attachment removal, and per-word Remove/Save flow are unchanged. Both the individual class Plan view and the All Classes grid render this same `manage-class-vocabulary.js`, so the feature covers both automatically — no separate wiring needed.
- Files touched: `app/classes/[id]/plan/manage-class-vocabulary.js`, `lib/lesson-resources/constants.js` (added `buildClipboardImageFileName`), `tests/lesson-resources.test.mjs` (2 new focused tests for the filename helper and that it passes vocabulary image validation). No schema migration; no API route changes — `register-vocabulary-image` already accepted arbitrary `File`-shaped uploads.
- Verification done: targeted ESLint on all 3 changed files (0 problems), full `npm test` (134/134 passing, including the 2 new cases), `npm run build` (compiled successfully, including `/classes/[id]/plan`), `git diff --check` (clean).
- Verification NOT done: authenticated browser QA of the actual paste interaction. The local dev server has `.env.local` Supabase credentials, but there's no local sign-in session and Claude cannot enter a password on Zack's behalf — so the class Plan page (auth-gated) couldn't be reached from this session. **Needs Codex (or Zack) to browser-verify**: paste a real clipboard image into a vocabulary card's Word field and into empty card space, confirm the preview appears with the "Save Changes will upload it" caption, Save Changes uploads and the card then shows the real stored image, and confirm plain text paste into Word/Definition still works normally. Test in both the individual class Plan view and the All Classes grid.
- **SHIPPED 2026-09-22** together with the projector changes above, at Zack's explicit request — see the "SHIPPED" note in the Vocabulary Projector entry above for the commit/deploy details. The paste interaction itself is still functionally unverified (needs authenticated QA): paste an image into a word's Word field and into empty card space, in both the individual class Plan view and the All Classes grid, confirm the preview + "Save Changes will upload it" caption, confirm Save Changes uploads it and the card then shows the real stored image, and confirm plain text paste into Word/Definition still works normally.

## What Changed (2026-09-22 Session - Vocabulary Projector Carousel)

- `Manage Class Vocabulary` now has a `Push Vocabulary to Projector` dialog in both class and grid views. Teachers choose available active-room displays, a 15-second to 5-minute change interval, and whether to use only vocabulary linked to a lesson marked completed in that class. They can update or stop the carousel from the same dialog. Autopilot and disabled screens cannot be selected.
- A teacher-authenticated projector API verifies editable class access and resource ownership, computes eligible words from the class plan and lesson-resource associations, and saves a separate shuffled word order for each selected screen in its existing `projector_sessions.screen_states`. Receivers rotate locally from a shared start time, so closing the teacher page does not stop playback. Protected vocabulary images are served to valid projector screen tokens only while the word is in a live carousel. No schema migration was needed.
- Verification: focused filter/rotation tests, targeted ESLint, `git diff --check`, and `npm run build` passed. Authenticated live browser QA confirmed seven named display choices, a 30-second default, 66 total eligible words, 56 completed-lesson words, and a working dialog in the grid; no real projector screen was changed during QA. Local dev server starts but its watcher still reports `EMFILE`; this checkout lacks local Supabase credentials for authenticated local UI verification.
- Shipped on `main` in commit `e9f4c9d`; GitHub's Vercel status succeeded for deployment `AKznFZZ77vTtR3RjKn7RKYRVVcEQ`. The live route `https://www.mathclaw.com/api/projector/vocabulary-carousel` returned the expected signed-out 401, and the authenticated class plan rendered the new dialog at `https://www.mathclaw.com/classes/41dd5d5e-c73d-49a8-90d2-a48bfa026bfd/plan`.

## What Changed (2026-09-22 Session - Lesson Vocabulary)

- Added `Manage Class Vocabulary` to both the individual class plan and All Classes grid. It loads every vocabulary entry associated with the selected class, supports search, and lets teachers edit the word, definition, and one-or-more lesson associations; remove the word; preserve/remove an existing attachment; or upload/replace it with one protected JPG, PNG, WebP, or GIF image. Image previews use the authenticated open route because private images cannot safely go through the unauthenticated Next image optimizer.
- The manager API validates teacher/class access, resource ownership, vocabulary item type, and every selected lesson before updates. New images upload under the teacher's existing private `lesson-resources` path; failed registrations roll back the new object, successful replacements clean up the old stored file, and existing links/files remain unchanged unless explicitly replaced or removed.
- No schema migration was required. A read-only production audit found 66 current vocabulary entries, confirmed all four image MIME types are allowed in the bucket, and confirmed the four existing lesson-resource storage policies. Verification: targeted ESLint, `git diff --check`, all 130 Node tests, and `npm run build` passed. Local rendering remains blocked by missing Supabase URL/key in this checkout (and the dev watcher still reports the known `EMFILE` warning).
- Added a course-level `Upload Vocabulary CSV` workflow to both the individual class plan and All Classes grid. The accepted three-column order is word, definition, lesson number; an optional header is supported, quoted commas/newlines parse correctly, the first eight rows are previewed, and imports are capped at 500 rows / 1 MB. The import is all-or-nothing when any row is malformed or its lesson number is not scheduled in the selected class.
- Lesson-number resolution runs on the server against the selected class's full plan. A production read-only audit found legitimate repeated codes for multi-part lessons (for example `1.02` and `1.02 (Part 2)`), so one CSV row associates its vocabulary entry with every scheduled curriculum lesson carrying that exact source lesson code. This preserves the requested three-column format and makes completion-based Projector lookup work for every part.
- CSV import did not require a schema migration. Verification: targeted ESLint, CSV/parser and multi-part association tests, `git diff --check`, all 129 Node tests, `npm run build`, and a read-only production lesson-code audit passed.
- Teachers can now associate vocabulary with one or both lessons on a planning day from both the individual class plan and the All Classes grid. Each entry has a required word, optional definition, and an optional link or uploaded file; lesson chips keep multi-lesson associations visible, and the individual class view supports removal.
- Vocabulary reuses the existing lesson-resource storage, ownership, and lesson-association model with `lesson_resources.item_kind = 'vocabulary'`. This makes future Projector retrieval deterministic: start with a class's completed lesson IDs, then resolve the owner's vocabulary through `lesson_resource_lessons`. Ordinary uploaded items remain isolated as `item_kind = 'resource'` and the Manage Uploaded Items panel excludes vocabulary.
- Added `supabase/migrations/20260922164020_lesson_vocabulary_items.sql`; applied to production `mathclaw-prod` as `lesson_vocabulary_items` (version `20260922164948`). Verification confirmed the new columns/constraints/index, existing RLS, authenticated CRUD grants, and a rolled-back vocabulary insert.
- Verification: targeted ESLint, `git diff --check`, all 125 Node tests, and `npm run build` passed. Supabase security/performance advisors surfaced only existing project-wide notices; the freshly created lookup index is naturally still reported as unused before live feature data exists.

## What Changed (2026-09-22 Session - Bulk Item Row Defaults)

- In the All Classes grid's Bulk Attach Items editor, `＋ Add New Item` now carries forward the preceding row's item type, class, and lesson. Item-specific fields (name, link/file, site name, and validation error) remain blank so each new attachment still starts clean.
- Verification: targeted ESLint, `git diff --check`, all 123 Node tests, and `npm run build` passed.

## What Changed (2026-09-22 Session - Dashboard Grid Shortcut)

- Added an `All Classes Grid` button to the dashboard hero for teachers with at least one active class. The button sets the existing `class_plan_view=grid` preference and opens the first active class plan, landing directly in the existing cross-class two-week grid.
- Added the small client component `app/dashboard/all-classes-grid-link.js`; no route, schema, or styling changes were needed.
- Verification: targeted ESLint, `git diff --check`, and `npm run build` passed. Local authenticated browser rendering remains blocked by missing Supabase environment variables; production deployment `4Ah1uxmHbXXTuZXh1hPxBFQFaYYb` completed successfully for code commit `ff0ba9b`, while signed-out live navigation correctly redirected `/dashboard` to sign-in.

## What Changed (2026-09-14 Session - Algebra I Curriculum)

- Updated Zack's `57AB | Algebra I` Illustrative Mathematics library from the 104-row CSV supplied on 2026-09-14. Zack chose to skip `2.03`; the four completed lessons (`2.01`, `2.02`, `2.04`, `2.05`) and their plan rows, dates, titles/objectives, IDs, and 11 lesson-resource associations were preserved. The library and plan now contain 103 ordered lessons, with `2.06` next on 2026-09-14 and the newly split lessons following the supplied sequence.
- Applied the guarded production data migration as Supabase version `20260914115153` (`algebra_i_curriculum_refresh_20260914`), then refreshed all 180 Algebra I announcements through the live class-plan action. Verified 99 future announcements match their newly scheduled lesson codes/titles, all 103 plan rows match curriculum order, and all original 87 lesson IDs remain stable. A before-state snapshot of affected curriculum/plan rows is at `/Users/zackarenstein/Documents/Codex/2026-09-13/b/algebra-i-pre-refresh-backup.json` (outside the repo).
- Migration shipped on `main` in commit `2bc5ea5`; Vercel deployment `CL6VLPZ3MmsVTR3m3WD5cR3ZJ6Gu` succeeded. Authenticated live route: `https://www.mathclaw.com/classes/c2512d97-7a35-4f11-9c15-053e49026c74/plan`. Local dev preview could not bind port 3000 (`EPERM`), so the live route and Supabase data were used for verification.

## What Changed (2026-09-13 Session - All Classes Planning)

- Bulk Attach Items now offers One of Each Lesson: choose a visible class and Links or Files to generate one editable row per distinct scheduled lesson in the two-week grid, without replacing filled drafts or duplicating lessons. Bulk link URLs use the same IXL/site title suggestions and unknown-site naming behavior as the single-lesson editor; file selections fill an empty title from the filename. Shipped in commit `2283dd3`, Vercel deployment `FX8RYwjYK8pVtzQzEXDKcRXkKUgW`, live at `https://www.mathclaw.com/classes/41dd5d5e-c73d-49a8-90d2-a48bfa026bfd/plan`; browser-verified seven AP Calculus rows, IXL title autofill, removal, and file-row generation without saving test items.
- The All Classes grid now has a collapsible Bulk Attach Items editor above the schedule. Each row creates one named link or file for one class/lesson; class and lesson menus are limited to the visible two-week window, rows can be added/removed, and Save All preserves failed rows with specific errors while refreshing successful attachments into the grid.
- A second collapsible Manage Uploaded Items panel loads every resource owned by the teacher across weeks, with search and bulk editing of names, link URLs, and lesson placement in editable class plans. File contents remain unchanged; multi-lesson associations stay intact unless a new lesson is selected.
- The All Classes grid and individual class plan now show a compact `0 | 1 | 2` lesson selector on each schedulable date. Dates containing any completed lesson are visibly locked, and off/grace/no-meeting dates remain non-editable.
- A date-specific `course_calendar_days.lesson_count_override` takes precedence over class pacing mode, weekday modifiers, half-day defaults, and same-day assessment reductions. Rebuilding immediately reflows later lessons in curriculum order; manual-completion pacing repeats the current one- or two-lesson set until completed.
- Added `supabase/migrations_20260913_pacing_day_lesson_count_overrides.sql`. Applied to production `mathclaw-prod` as `pacing_day_lesson_count_overrides`; verified the nullable integer column and `0..2` check constraint.
- Verification: all 122 Node tests passed, repo-wide ESLint passed, `npm run build` passed, production Vercel status succeeded, and authenticated live browser QA confirmed both grid and individual-class layouts without mutating real pacing data.
- Feature commit: `0c69c0f` (`Add per-day lesson pacing controls`). Vercel deployment `3EGUdMMWdoZHBUU5QxAfKETqGsUs`; live route verified at `https://www.mathclaw.com/classes/<course-id>/plan`.
- Follow-up: centered the labels on all full-width All Classes grid actions, including resource summaries such as “Add File” and “Files (1)”.
- Follow-up: kept the All Classes view toggle and class switcher on one desktop row to reduce the sticky title bar height; the controls can still wrap on mobile.
- Follow-up: sized the “This Class” and “All Classes” toggle buttons so each label remains on one line.
- Follow-up: the Plan title bar now slides away while scrolling down and immediately returns when scrolling up; it remains visible near the top and stays non-sticky on phones.

## What Changed (2026-07-10 Session - Account Type Defaults)

- New and unknown MathClaw accounts now default to `student` instead of `teacher` across shared auth helpers, sign-in/callback fallbacks, admin account-save defaults, onboarding profile fallback props, and admin user-list display.
- Legacy/incomplete accounts that already own a course still infer `teacher`; explicit `teacher`, `student`, and `player` values remain respected.
- Added `supabase/migrations_20260710_default_profiles_to_student.sql` and updated `supabase/schema.sql` so profile rows inserted without an `account_type` default to `student` at the database layer.
- Added `tests/account-type.test.mjs` covering unknown-account student fallback, legacy teacher inference from owned courses, and student redirect safety.
- Verification: `node --test tests/account-type.test.mjs`, `npm test`, `node --check` on changed JS files, `git diff --check`, and `npm run build` passed. Targeted eslint was blocked by an existing `app/admin/page.js` React purity error at `Date.now()` that predates this change.

## What Changed (2026-07-08 Session - Projector Scene Workshop Sidebar)

- `app/projector/projector-scene-workshop.js` now renders the Workshop left rail as collapsible sections, with `Upload Pool` moved above `Edit Existing Scene` and `Saved Items`.
- Follow-up `f8f2b90` makes all three Workshop sidebar sections collapsed by default.
- `app/projector/styles.css` adds the matching section header/toggle styling while preserving the existing Workshop visual language.
- Verification: `node --check app/projector/projector-scene-workshop.js`, targeted `npx eslint app/projector/projector-scene-workshop.js` (0 errors, existing `<img>` warnings only), `git diff --check`, and `npm run build` all passed.
- Shipped to `origin/main` at `af0af5f` (`Polish projector scene workshop sidebar`); `https://www.mathclaw.com/projector` responds from Vercel with the expected unauthenticated 307 redirect to `/auth/sign-in?redirect=/projector`, and `/` responds 200.
- Local browser QA limitation: the dev server starts, but route rendering is blocked in this checkout by missing Supabase URL/key env vars, and the dev watcher logs `EMFILE: too many open files` warnings.
- Deployment status limitation: Vercel connector still returns 403 for `zack-arensteins-projects`, so deployment ID/readiness could not be read directly from the connector.

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
- Bell Schedules schema is live; authenticated Profile/calendar QA and clipboard image-paste QA passed. Two QA fixes are deployed as `61ba481`. Projector timer/Autopilot QA still awaits a designated safe screen (see Active Tasks).
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
- **Finish projector QA after Zack identifies/authorizes a safe screen.** Migration and Profile/calendar QA are complete; clipboard QA is complete. Still unverified: bell-schedule Autopilot start and period-end behavior while `/projector` stays open; manual carousel class-name label; scheduled “Starting soon” state, pending schedule restoration on dialog reopen, timed transition without reload, and update/stop behavior. Requested approval to add `QA Browser Only` screen 8 in Room 206; do not change screens 1–7. Existing unassigned template `Full Day Test QA` has AP Calculus 08:10–08:12; adjust to a few minutes in the future on the actual test date, assign that date through Profile, then restore the calendar assignment after testing.

## Active File Ownership
- None currently.

## Migrations Or Policy Changes Made
- Applied `supabase/migrations/20260923120000_bell_schedules.sql` to production via Supabase MCP as `bell_schedules` version `20260924113813` on 2026-09-24; schema/RLS/grants verified.
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
