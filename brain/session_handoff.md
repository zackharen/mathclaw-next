# Session Handoff

Read this file FIRST in future AI sessions before doing any work.

This file represents the **current state only**. It should stay short enough to be loaded in every new session without cost. When a session ends:
1. Move the prior "What Was Built" entries to `/brain/history.md` under a dated heading.
2. Rewrite "Current State Of The Project" to reflect *now*, not a log.
3. Prune obsolete items from "Next Recommended Steps" and "Known Issues."

## Last Updated
2026-06-04 America/New_York (Projector dashboard top-text preview containment)

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

## Current State Of The Project
- Three account types live in production: `teacher`, `student`, `player` (see `conventions.md` -> Account Types)
- The global site shell now uses full-page width instead of the older narrow 1180px cap, while still keeping responsive outer padding
- The nav brand area shows the horizontal MathClaw logo (`public/mathclaw-logo-nav.png`) as a home-page link; scales responsively by height via `clamp`
- The homepage (`app/page.js`) is intentionally minimal: banner (if set) + `homeWelcome` heading + MathClaw square logo. User-type-specific widgets will be added incrementally. The welcome text is editable from admin → Editable Site Copy.
- The `/about` page shows the centered square MathClaw logo above two cells only: "About Us" from Admin `About Us text` / `aboutStory`, and "Mission Statement" from Admin `Mission statement` / `missionStatement`; the cells match height on desktop and stack on mobile.
- Admin page is live: `Admin Sections` sits below the count summary and has five alphabetized views. `accounts` → collapsed School Snapshot + collapsed User Information; `diagnostics` → collapsed Traffic & App Usage, collapsed Internal Error Log, collapsed Bug Reports; `features` → Feature Rollout Controls with grouped admin disclosure formatting, alphabetical/status sorting, short rollout labels, navy shade status chips, and editable Admin copy fields; `site-copy` → Editable Site Copy; `mastery` → Mastery Settings (cross-game adaptive progression rules + simulator). `/admin` default for owner/admin users is Bugs and Internal Errors.
- The `/play` page now collapses its main content blocks behind matching disclosure headers, with feedback sections opening automatically when needed; section order is Classes, Group Activities, Fun & Games, Awards & Extra Credit, Create A Math Question
- Group Activities is a direct 3-column card grid on `/play` with Double Board, Lowest Number Wins, and Open Middle
- Tournament Mode v1 is live in code as a fourth Group Activities option and currently supports Connect 4 only. It requires `supabase/migrations_20260506_connect4_tournaments.sql` to be applied in production Supabase before authenticated use.
- Fun & Games has three equal-width columns: `#arcade`, `#mathskills`, and `#survivalskills`; Locker Practice belongs under `#survivalskills`
- Open Middle is in code at `/play/open-middle`, appears under Group Activities, and its Supabase schema/policies were applied successfully in the active Supabase project via SQL Editor
- `/play/locker-practice` is live on `main`; dial movement, validation, and visual model are all consistent
- `/play/lowest-number-wins` is live on `main` and deploying; **migration `migrations_20260426_lowest_number_wins.sql` must be run in production Supabase before the game works**
- Lowest Number Wins uses kebab-case for the actual Next route (`/play/lowest-number-wins`) and keeps a legacy underscore redirect (`/play/lowest_number_wins`) for catalog/old-link compatibility
- Teacher workspace and student arcade are both active, real surfaces; class creation defaults to no-curriculum; curriculum opt-in
- Arcade supports both `student` (class required) and `player` (class optional) entry paths
- Integer Practice is a large adaptive system with its own progression engine, Node tests, owner-managed global mastery tuning, and compact aggregate saved progress
- Double Board supports integer operations, percent-change multipliers, and Mixed Review, with a live classroom flow including turn reordering, student-voted settings, per-student lockouts, score-sorted class roster ranking, roster presence colors, synced timers, teacher next-student control, podium end-state, and projector fullscreen. Percent Change Multipliers Column 3 uses 2-decimal percents and ten-thousandths answer scaling.
- Projector Party is in code at `/projector` for teachers and `/projector/screen` for public display screens. It uses Supabase Realtime Broadcast over `projector-session-<sessionId>` and stores non-sensitive screen states in `projector_sessions`. Projector supports text/LaTeX/image/video sending, screen-recording upload conversion to projector-friendly MP4, fullscreen receiver controls, and full-viewport image/video display on live screens. LaTeX content preserves typed whitespace through send/save flows; literal newlines render as stacked display rows; unescaped `%` displays as a percent sign instead of becoming a comment; standalone `^`/`↑` render as an up arrow while normal exponent syntax remains available. LaTeX/image/video composer modes can include optional plain `Top Text` above the content; this top text persists in live screen states and Scenes. Public projector screens and dashboard previews use smaller top text and contain media inside the remaining space so images remain fully visible. The teacher dashboard has collapsible **Screen Selection**, **Scenes**, and **Saved Items** panels; Screen Selection is open by default and includes screen targeting, content type tabs, the composer (inputs + preview), and Send/Clear/message. Each dashboard screen card has an `Edit` button that loads that screen's content back into the composer for editing/resending. Rotate controls support both `↶ Rotate Left` and `↷ Rotate Right`. The **Saved Items** library supports category tagging (`Questions`, `Activities`, `Word Walls`, `Data Walls`, `News`, `Announcements`), client-side search, category filter pills, and inline rename per item. Saved video/GIF thumbnails are static in the tiny saved lists but still play in live screen previews. The **Scenes** panel (formerly Room Setups) saves/restores full four-screen arrangements; folders are collapsible sections (all closed by default) with a small "D" delete button and a "+ New Folder" form at the bottom. Screen URLs use the readable format `mathclaw.com/projector/screen/<pin>/<screenNumber>`; old `?token=` URLs still work. Projector screen receiver is locked to viewport height — images and videos never require scrolling. Production Supabase migrations `projector_library_items`, `projector_scene_library_items`, `projector_scene_folders`, and `projector_library_category` were applied successfully.
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
- Created `/supabase/migrations_20260601_projector_sessions.sql` and applied it to production Supabase project `mathclaw-prod` (`ruaaznacaywngewxyged`) on 2026-06-01 via the Supabase connector. The apply call returned `success: true`; follow-up migration listing was blocked by connector reauthentication.
- Created `/supabase/migrations_20260601_projector_library_items.sql` and applied it to production Supabase project `mathclaw-prod` (`ruaaznacaywngewxyged`) on 2026-06-01 via the Supabase connector. The apply call returned `success: true`; migration list verification showed `projector_library_items` at version `20260602000202`.
- Created `/supabase/migrations_20260602_projector_scene_library_items.sql` and applied it to production Supabase project `mathclaw-prod` (`ruaaznacaywngewxyged`) on 2026-06-02 via the Supabase connector. The apply call returned `success: true`; migration list verification showed `projector_scene_library_items` at version `20260602134120`.
- Created `/supabase/migrations_20260602_projector_scene_folders.sql` and applied it to production Supabase project `mathclaw-prod` (`ruaaznacaywngewxyged`) on 2026-06-02 via the Supabase connector. The apply call returned `success: true`; migration list verification showed `projector_scene_folders` at version `20260602141846`.
- Created `/supabase/migrations_20260427_double_board_decimal_percents.sql`; it must be applied to Supabase before decimal Percent Change Multipliers Column 3 questions can be stored in live sessions.
- Created `/supabase/migrations_20260506_connect4_tournaments.sql`; it must be applied to production Supabase before Tournament Mode can be used with logged-in users. Supabase connector application failed in Codex due an app-connector handshake error before the SQL reached the project.
- Created `/supabase/migrations_20260513_profile_nicknames.sql`; it must be applied to production Supabase before student/player nicknames persist in `profiles.nickname`. Code includes fallbacks for schemas where the column is not present.
- Restored `/supabase/migrations_20260424_open_middle.sql`; user applied it successfully in Supabase SQL Editor on 2026-04-28 after running `drop policy if exists ...` cleanup for the pre-existing Open Middle/school policies.
- Brain policy changed: future coding sessions should load `coding_agent_principles.md` from `START_HERE.md` and use its checklists before editing and before final response.
- Brain workflow changed: future sessions should load the model-specific overlay from `brain/model_workflows/` (`codex.md` for Codex, `claude.md` for Claude Code) after the shared base files. Codex overlay covers connectors/plugins, browser verification, automations, subagents, review mode, skills, artifacts, and permission-aware work.
- Brain docs restored: `project_overview.md`, `architecture.md`, `file_map.md`, and `feature_context/INDEX.md` exist again in concise form.
- Brain workflow changed: the `localhost:3000` dev server check is now Codex-overlay behavior (see `brain/model_workflows/codex.md` startup checklist), not universal startup behavior. Claude Code does not run the dev server check by default.
- Brain docs changed: `future_ideas.md` is now the lightweight future ideas / todo bank and should be loaded only when the user asks for future ideas, backlog, roadmap candidates, todo items, or to reference the bank.

## Next Recommended Steps
Prune completed items from this list when rewriting this file. Order is rough priority.

1. **Run `migrations_20260426_lowest_number_wins.sql` in production Supabase** - required before Lowest Number Wins works with real classes.
2. **Run `migrations_20260506_connect4_tournaments.sql` in production Supabase** - required before Connect 4 Tournament Mode works for authenticated users.
3. **Projector next build: Question Builder** — the `Questions` category needs a purpose-built composer: prompt (LaTeX or text), up to 4 multiple-choice options, optional correct answer marked. `Word Walls` need a multi-term input that renders as a grid on the projector screen. `Data Walls` need a structured data display. The other 3 categories (`Activities`, `News`, `Announcements`) are fine with the existing composer. Load `brain/future_ideas.md` → "Projector Classroom Display System" before implementing.
3a. **Projector next build: Playlists / Timed Rotations** - group saved items or scenes into timed rotations per screen or across all screens. Load `brain/future_ideas.md` -> "Projector Classroom Display System" before implementing.
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
