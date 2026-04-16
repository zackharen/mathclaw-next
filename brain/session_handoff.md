# Session Handoff

Read this file FIRST in future AI sessions before doing any work.
Update this file at the end of each work session.

## Last Updated
2026-04-16 America/New_York

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

## Current State Of The Project
- Teacher workspace and student arcade are both active, real surfaces in production-oriented code
- Student arcade includes many standalone game routes plus live classroom play
- Integer Practice recently grew into a large adaptive system
- Saved-state and auth/session behavior have required recent fixes
- Temporary admin repair tooling exists for the Integer Practice auth-metadata issue
- Double Board has another round of layout/readability fixes applied; a browser check would still be useful for projector/fullscreen confirmation

## Active Tasks
- None in progress inside this session after the `/brain` setup
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

## Known Issues / Bugs
- Middleware file convention should likely move from `middleware.js` to `proxy` eventually
- Auth metadata must stay small; large saved game payloads can break headers/session cookies
- Temporary route exists:
  - `app/api/admin/repair-integer-practice/route.js`
- Repo-wide lint still has pre-existing unrelated failures in:
  - `app/admin/page.js` (`Date.now()` during render)
  - `app/play/comet-typing/game-client.js` (hook dependency warning and unescaped apostrophe)

## Notes For Future AI Sessions
- Do not touch `/Users/zackarenstein/mathclaw-next/supabase/migrations_20260331_join_course_by_code_rpc.sql` unless explicitly asked
- Production schema may be older than the repo in places, so keep fallback logic intact
- Owner access is controlled by `MATHCLAW_OWNER_EMAILS`
- Keep edits modular and load only the feature files needed for the task
