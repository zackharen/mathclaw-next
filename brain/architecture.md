# Architecture

MathClaw is a Next.js App Router app backed by Supabase and deployed through Vercel.

## Application Structure

- `app/` contains routes, server components, client game clients, route handlers, and server actions.
- `app/play/*/page.js` usually handles server-side bootstrapping for a game route.
- `app/play/*/game-client.js` usually owns browser interaction, local React state, polling, and live UI.
- `app/api/*/route.js` owns JSON APIs for polling, session mutation, and server-side game actions.
- `app/*/actions.js` holds server actions for forms and mutations tied to pages.
- `lib/` contains shared auth, Supabase, game, question-engine, display, site-config, and observability helpers.
- `supabase/` contains schema and migration SQL.
- `tests/` contains focused Node tests for shared logic.
- `brain/` contains AI-session memory, conventions, and workflow instructions.

## Data And Auth

- Supabase auth is the login source.
- Account-type metadata exists on auth users and/or profiles, but code must tolerate legacy/missing metadata.
- Privileged server work uses admin/service-role clients from `lib/supabase/admin.js`.
- Regular server components and actions use Supabase clients that respect user session and RLS.
- Large saved game data should live in database tables such as `saved_game_progress`, not auth metadata.

## Game Pattern

Most classroom games follow this shape:
- Server `page.js` loads the user, class/session context, and initial data.
- Client `game-client.js` manages live interaction and polling.
- API `route.js` validates actions, reads/writes Supabase tables, computes server-trusted game state, and returns sanitized payloads.
- Historical results write through `game_sessions` and shared stats helpers where appropriate.

## UI Pattern

- Global styles live in `app/globals.css`.
- Game UIs are bold, high-contrast, and classroom-readable.
- Teacher/admin surfaces favor grouped disclosure stacks, compact cards, and predictable controls.
- Keep feature-specific UI language consistent unless the task is explicitly a redesign.

## Verification Pattern

Use the smallest useful verification ladder:
1. Static inspection for docs/copy-only changes.
2. Focused Node tests for shared engines and pure logic.
3. `npm run build` for route/component/app changes.
4. User-facing verification for UI, responsive layout, live games, modals, timers, and teacher/student/projector flows. The method depends on the active model and available tools (see model overlay).
5. GitHub/Vercel/Supabase connector checks for production, deployment, migration, or environment uncertainty.

## Deployment Shape

- Normal delivery assumes user-facing fixes and features should reach the live site unless the user says otherwise.
- Avoid leaving intended-live work only on a side branch.
- Verify production through deployment status and direct live-site checks when tools and permissions allow.
