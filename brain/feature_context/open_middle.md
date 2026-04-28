# Open Middle

## Purpose
Run live classroom "Open Middle" puzzles where students fill underscore blanks with non-repeating digits from a shared pool, then compare full solutions only after the timer ends.

## Main Files
- `app/play/open-middle/page.js`
- `app/play/open-middle/game-client.js`
- `app/play/open-middle/[sessionId]/page.js`
- `app/play/open-middle/[sessionId]/game-client.js`
- `app/api/play/open-middle/route.js`
- `lib/open-middle/core.js`
- `lib/student-games/catalog.js`
- `app/play/page.js`
- `supabase/migrations_20260424_open_middle.sql`

## Architecture Decisions
- Followed the Double Board pattern instead of inventing a parallel teacher workflow:
  - `/play/open-middle` is the teacher/student hub for template authoring, template selection, and live-session launch
  - `/play/open-middle/[sessionId]` is the actual classroom play/reveal route
  - `/api/play/open-middle` owns dashboard loading, template persistence, session lifecycle, joins, autosave, reveal, and teacher review payloads
- Kept Open Middle table-backed:
  - `open_middle_templates` stores the author-facing canonical prompt
  - `open_middle_template_versions` stores operator-swapped reusable variants
  - `open_middle_sessions`, `open_middle_players`, and `open_middle_responses` handle live classroom play
- Added a lightweight school system for this feature:
  - `schools`
  - `school_memberships`
  - templates can be scoped `private`, `class`, `school`, or `public`
- Parsing and validation live in `lib/open-middle/core.js` so authoring preview, session reveal, and future generators all use the same rules
- Student play intentionally hides correctness during `waiting` and `live`; validation is surfaced only in `reveal` / `ended`

## Core Behavior
- Teachers author prompts with `_` blanks and a digit pool
- Parser converts raw text into structured lines/tokens with stable blank ids
- Version generator produces operator-swapped variants across `+`, `-`, `×`, and `÷`
- Student client fills the next empty blank from the digit pool, and clicking a filled blank returns the digit to the pool
- Reveal validates:
  - all blanks filled
  - no repeated digits when uniqueness is on
  - each equation evaluates as true

## Local Status
- Locally viewable on `http://localhost:3000/play/open-middle` once the app is running
- Auth is still required locally; the sign-in redirect currently lands on `/auth/sign-in?redirect=/play/open-middle`
- `next start` was the stable local-view path during this session; `next dev` hit local `EMFILE` watcher-limit noise on this machine
- Full end-to-end session/template storage still depends on running `supabase/migrations_20260424_open_middle.sql` in the target Supabase project

## Known Risks
- The expression evaluator is intentionally narrow and safe, but still simple: it relies on sanitized arithmetic expressions instead of a full custom math parser
- Template visibility uses `rules.courseId` for class-scoped templates; if Open Middle grows into a broader curriculum library, a dedicated `course_id` column may be cleaner
- Student "automatic receive" currently happens through the Open Middle hub redirecting into an active class session, not a site-wide forced redirect from `/play`
- There is no advanced approval dashboard yet beyond the teacher approve action in the Open Middle hub
- No analytics/sorting layer yet for reveal comparisons beyond the stored response list

## Next Improvements
1. Add richer teacher reveal tools: sort by correct/incorrect, group identical answers, and spotlight notable strategies
2. Add explicit class/school approval queues for student-authored templates
3. Expand the parser beyond single-digit blanks if multi-digit Open Middle variants become important
4. Add stronger session presence tracking if teachers need projector-grade "who is actively here" signals like Double Board
5. Decide whether school membership should stay feature-local or become part of the broader MathClaw teacher workspace
