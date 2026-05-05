# Conventions

## General Code Style
- Codebase is JavaScript-first, App Router style
- Prefer readable product code over abstraction-heavy patterns
- Shared logic usually lives in `lib/` if more than one route or component needs it
- Keep feature logic close to its route when the scope is narrow

## Naming Conventions
- Route folders use kebab-case slugs that match URLs
- Many game slugs use snake_case in persistence and catalog layers, but route folders often use kebab-case
- Shared helpers and feature engines use descriptive names, not generic utility buckets
- Supabase RPC names and migration files are verbose and date-prefixed

## UI And Styling Conventions
- Global styles live in `app/globals.css`
- Visual style is bold, clean, and high-contrast rather than minimalist/default
- Existing UI language should be preserved inside a feature unless explicitly redesigning it
- Games often use large headings, framed cards, pill stats, and strong navy/ink styling
- Avoid bland or generic “AI app” aesthetics

## Component Patterns
- Most game routes use:
  - `page.js` for server-side bootstrapping
  - `game-client.js` for client interaction and state
- Shared display helpers are light and intentionally reusable
- Teacher surfaces often rely on server-rendered pages plus inline forms/server actions

## State Management Patterns
- Local React state is the default in game clients
- Server state is loaded on page render or fetched from route handlers
- Persistence patterns vary:
  - `game_sessions` / stats for runs and leaderboards
  - auth metadata save-state for some resumable flows
  - localStorage as a fallback or complement in some games
- Be careful adding large data to auth metadata because it can inflate auth cookies/headers

## File Organization Rules
- Put feature-specific engines under `lib/<feature>/` when they are substantial
- Put reusable question logic under `lib/question-engine/`
- Keep route handlers under `app/api/...`
- Keep game assets under `public/` if they must ship to the browser

## Repeated Product Patterns To Preserve
- Class-scoped game visibility and leaderboard logic
- Owner/admin guardrails through owner email and admin scope helpers
- Account-type fallbacks because production schema may be older than repo expectations
- Strong separation between teacher workspace and student arcade

## Documentation Rules For `/brain`
- Keep files concise and high-signal
- Mark uncertain items as inferred
- Prefer modular files over one giant project summary
- Update `session_handoff.md` at the end of work sessions

## Delivery Convention
- Unless the user explicitly says otherwise, interpret requests to fix/build/change a feature as requests to make that change live on the site.
- Do not stop at local edits or a pushed side branch if the normal project workflow requires promoting the change to the production branch/deployment path.
- If there is meaningful deployment risk or ambiguity, pause only long enough to clarify the safest path; otherwise assume the user wants the end-to-end production result.

## Verification Convention

UI and live classroom-flow changes require user-facing verification before being considered done. The verification method depends on the active model, available tools, auth access, and risk level. If full verification is blocked, state what was checked and what remains unverified.

Each model's workflow overlay (`brain/model_workflows/codex.md` or `brain/model_workflows/claude.md`) defines the verification methods available to that model.

## Command Shortcuts

### `USH`
When the user types `USH`:
1. Analyze the current codebase state and recent changes
2. Update `/brain/session_handoff.md`
3. Include:
   - what was accomplished
   - what is in progress
   - what should happen next
   - issues or bugs found
4. Do not modify any other files unless the user explicitly asks

This is a workflow convention for future AI sessions and should be treated as a project command.

### `USHM`
When the user types `USHM`:
1. Analyze the current branch, codebase state, local changes, and recent changes
2. Run the smallest useful verification checks before shipping
3. Commit local changes if needed with a clear message
4. Merge/promote the work to `main` if the current branch is not already `main`
5. Push `main`
6. Deploy or promote the pushed changes to the production site using the normal MathClaw deployment workflow
7. Confirm the live site/deployment result when tools and permissions allow
8. Update `/brain/session_handoff.md` with:
   - what changed
   - what is in progress
   - what should happen next
   - issues or bugs found

`USHM` means "push all changes live and update memory." Treat it as explicit approval for the commit/push/deploy workflow, but not as approval for destructive commands such as force pushes, hard resets, or destructive database/schema operations.

### `vocab`
When the user types `vocab`:
1. Open `/Users/zackarenstein/mathclaw-next/brain/education/vocabulary.md`.
2. Pick 3 words that have NOT been displayed earlier in the current conversation. If all words have been shown, start over from the top.
3. For each word, output it in this exact format:

---
**[WORD]**
*Definition:* [definition in plain English]
*Example:* [example drawn from the MathClaw codebase]
*Non-example:* [a concrete contrast that shows what it is NOT]

---

Keep the tone conversational and avoid jargon in the definitions themselves — the point is to make the concept click, not to sound technical.

### `LU` (Let's Update)
When the user types `LU` followed by a set of notes or requested changes:
1. Read the standard startup brain files plus any feature context files relevant to the requested changes.
2. Ask the user clarifying questions **one at a time**, numbered (e.g. **1.**, **2.**), waiting for each answer before asking the next.
3. Only ask questions where the answer would meaningfully change the implementation. Skip questions that are already clear from context.
4. Once all questions are answered, craft a detailed, self-contained implementation prompt intended for a **new chat session** to execute.
5. Output the final prompt in a **code block** for easy copying.

The prompt must:
- Open with the standard brain entrypoint instruction and specify which model will execute it and which overlay to load. Example for Codex: `Use the MathClaw brain entrypoint at /Users/zackarenstein/mathclaw-next/brain/START_HERE.md and follow it exactly. You are Codex. Load the Codex workflow overlay at /Users/zackarenstein/mathclaw-next/brain/model_workflows/codex.md.`
- List which feature context files to load
- Describe each change with enough specificity that a new AI session can implement it without needing to ask follow-up questions (include file names, function names, line number hints, and precise behavior)
- Include verification steps and delivery reminder (carry changes live per delivery convention and update `session_handoff.md`)
