# Vibecoder Vocabulary

Terms drawn directly from the MathClaw codebase. Every word here corresponds to something that actually exists in the project.

---

## React / Frontend

### Component
A self-contained piece of UI that React can render. Everything visible on the page is a component — the nav bar, a game tile, a score card. Components can be composed (nested inside each other). **Example:** `GameReadyBanner` in `app/components/GameReadyBanner.js`. **Non-example:** `createClient` in `lib/supabase/server.js` — that's a utility function, not a component; it produces no UI.

### State
Data inside a component that can change over time. When state changes, React re-renders the component to show the new value. **Example:** In `game-client.js`, `useState` tracks the current session payload, the countdown timer, and whether the student has answered. **Non-example:** A CSS class name — it's static text baked into the file, not data that changes at runtime.

### Hook
A special React function whose name starts with `use`. Hooks let you add state and lifecycle behavior to a component without writing a class. The most common ones in MathClaw are `useState` (store a value), `useEffect` (run side effects like polling), `useCallback` (memoize a function), and `useMemo` (memoize a computed value). **Example:** `useEffect` in `game-client.js` sets up the polling interval that keeps the game board in sync. **Non-example:** `normalizeId()` in the route handler — it's a plain function, not a hook; it doesn't start with `use` and can't manage state.

### Props
Short for "properties." The inputs you pass into a component from its parent, like function arguments. **Example:** `<GameReadyBanner href={gameReadyBannerHref} />` — `href` is a prop. **Non-example:** `const [session, setSession] = useState(null)` — that's local state, not a prop; it lives inside the component, not passed in from outside.

### Hydration
After the server sends pre-rendered HTML to the browser, React "hydrates" it — attaching event listeners and making it interactive. If the server HTML doesn't exactly match what React would produce on the client, you get a hydration error. **Example:** The admin page had a hydration error because `<p>` tags inside `<summary>` are invalid HTML, causing the browser to auto-close them; the server and client ended up with different DOM trees. **Non-example:** A full client-side render where the server sends an empty `<div id="root">` and React builds everything from scratch — no hydration happens because there's no pre-rendered HTML to match.

### Re-render
Every time a component's state or props change, React re-runs the component function and updates the DOM with the new result. **Example:** When the polling interval fires and `setSession(newData)` is called in `game-client.js`, React re-renders the entire game board with fresh data. **Non-example:** Fetching data from Supabase but throwing it away without calling `setState` — the fetch happens but the component doesn't re-render because nothing changed in React's view.

---

## Next.js

### App Router
The folder-based routing system in Next.js 13+. Every folder inside `app/` that contains a `page.js` becomes a URL route. Nested folders create nested routes. MathClaw uses this exclusively. **Example:** `app/play/double-board/page.js` maps to the URL `/play/double-board`. **Non-example:** The old Next.js `pages/` directory style — MathClaw doesn't use it; there is no `pages/` folder in this project.

### Server Component
A React component that runs only on the server. It can query the database directly, read environment variables, and do expensive work — but it can't use `useState`, `useEffect`, or browser APIs. Most `page.js` files in MathClaw are server components. **Example:** `app/layout.js` queries Supabase for the current user and builds the nav — all on the server, before the HTML reaches the browser. **Non-example:** `game-client.js` files marked with `"use client"` at the top — those run in the browser.

### Client Component
A component marked `"use client"` at the top of the file. It runs in the browser, can use `useState` and `useEffect`, and handles user interaction. **Example:** Every `game-client.js` in `app/play/*/` starts with `"use client"` and manages game state in the browser. **Non-example:** `app/play/page.js` — no `"use client"` directive, so it's a server component; it does its Supabase work on the server and sends plain HTML.

### Server Action
A function marked `"use server"` that runs on the server even when called from a client component. Used for form submissions and mutations. **Example:** `signOutAction` in `app/auth/actions.js` — marked `"use server"`, called from a `<form>` in the nav, runs `supabase.auth.signOut()` on the server. **Non-example:** A `fetch("/api/play/double-board", ...)` call in `game-client.js` — that's a regular HTTP call to a Route Handler, not a Server Action.

### Route Handler
An API endpoint defined in an `app/api/*/route.js` file. It receives HTTP requests and returns JSON or other responses. The game polling and session mutation logic lives here. **Example:** `app/api/play/double-board/route.js` handles `GET` (poll session state) and `POST` (player actions). **Non-example:** `app/play/double-board/page.js` — that's a page file, not an API; it renders HTML, not JSON.

### Middleware
Code in `middleware.js` at the project root that runs before every request reaches a page. Used here for auth gating — if a user isn't logged in and tries to visit `/play`, middleware redirects them to `/auth/sign-in`. **Example:** `middleware.js` checks `PROTECTED_PREFIXES` and calls `NextResponse.redirect` for unauthenticated visitors. **Non-example:** A `useEffect` in a client component that checks auth — that runs after the page loads in the browser, which is too late to prevent flashes of protected content.

### SSR (Server-Side Rendering)
Rendering the HTML of a page on the server before sending it to the browser. The user sees real content immediately instead of a blank loading state. Next.js App Router does this by default for Server Components. **Example:** The `/play` page renders the arcade game list on the server using Supabase data, so a student sees games immediately on load. **Non-example:** A polling `fetch` loop in `game-client.js` — that's client-side data fetching, not SSR; the component renders in the browser after hydration.

### Layout
A `layout.js` file that wraps every page inside its folder. It renders once and stays mounted while you navigate between child pages — great for persistent UI like the nav bar. **Example:** `app/layout.js` wraps every page in the project with the topbar nav, the role badge chip, and the `GameReadyBanner`. **Non-example:** A component you import manually into one specific page — that only appears on that page, it's not a layout.

---

## Database / Supabase

### Supabase
The backend service powering MathClaw. It provides a Postgres database, auth (sign-in / sign-up), and auto-generated REST/realtime APIs. The code talks to it via `@supabase/ssr` and `@supabase/supabase-js`. **Example:** `createClient()` from `lib/supabase/server.js` is how every server component and route handler reaches the database. **Non-example:** Vercel — that's the hosting/deployment platform; Supabase is the database.

### RLS (Row Level Security)
Rules defined in Postgres that control which rows a user can read, insert, update, or delete. Without an RLS policy allowing access, a query returns nothing. **Example:** Students can only read game sessions for courses they're enrolled in — that's enforced by an RLS policy on the `double_board_sessions` table. **Non-example:** An `if` check inside JavaScript code — that's application-level validation; RLS lives in the database and enforces rules even if the JS is bypassed.

### RPC (Remote Procedure Call)
A custom SQL function stored in Supabase that you call like an API. Used when a plain `SELECT` or `INSERT` isn't enough — for example, joining across security-definer boundaries or doing complex multi-table logic atomically. **Example:** `join_course_by_code` is an RPC that looks up a course by its join code and adds the student in one atomic database call. **Non-example:** `supabase.from("profiles").select("*")` — that's a plain table query, not an RPC.

### Migration
A `.sql` file that makes a specific change to the database schema — creating a table, adding a column, defining a policy. Migrations are applied in order and kept in `supabase/migrations_*.sql`. **Example:** `migrations_20260426_lowest_number_wins.sql` creates the tables and policies the Lowest Number Wins game needs; it must be run in production Supabase before the game works. **Non-example:** Editing the JavaScript code for the game — that changes the app logic, not the database structure.

### Upsert
A database operation that inserts a new row if it doesn't exist, or updates the existing row if it does. Saves writing separate `INSERT` and `UPDATE` logic. **Example:** `upsertGameStats` in `lib/student-games/stats.js` — writes a student's score whether they've played before or not. **Non-example:** `supabase.from("sessions").select(...)` — that's a read, not a write.

### Admin Client
A Supabase client created with the service role key (stored in a secret env var). It bypasses all RLS policies and can read/write anything. Used only in server-side code for privileged operations. **Example:** `createAdminClient()` from `lib/supabase/admin.js` is used inside route handlers to write game session data that regular users can't write directly. **Non-example:** `createClient()` from `lib/supabase/server.js` — that's the regular client; it respects RLS and only sees what the logged-in user is allowed to see.

### Auth Metadata
Extra data stored directly on a Supabase auth user record (in `raw_user_meta_data`). Fast to read because it comes back with every auth check — but it inflates cookie/header size, so large objects should live in a database table instead. **Example:** `account_type` ("teacher", "student", "player") is stored in auth metadata so every page can check it without an extra database query. **Non-example:** Game session state in `double_board_sessions` — that's a full database table row, not auth metadata.

---

## General Web

### Slug
A short, URL-friendly string identifier for a thing. Usually lowercase with hyphens or underscores instead of spaces. **Example:** `"double-board"` in the URL `/play/double-board`, or `"double_board_review"` as the `game_slug` stored in the database. **Non-example:** A UUID like `"3f7a2b1c-…"` — that's a unique ID, not a slug; slugs are meant to be human-readable.

### Environment Variable (Env Var)
A configuration value stored outside the code, usually in a `.env.local` file locally or in the Vercel/Supabase dashboard in production. Keeps secrets out of the git repo. **Example:** `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are env vars — the URL is safe to expose, the key is not. **Non-example:** A constant defined directly in a `.js` file like `const GAME_SLUG = "double_board_review"` — that's a hardcoded value, not an env var.

### Polling
Fetching data from the server repeatedly on a timer to stay in sync. Used in real-time game views where a WebSocket would be overkill. **Example:** `game-client.js` for Double Board runs a `setInterval` that calls the Supabase route handler every few seconds to check if the session has changed. **Non-example:** A Supabase realtime subscription (WebSocket) — that pushes updates to the client instantly instead of the client asking repeatedly.

### Redirect
Automatically sending the user from one URL to another. Can happen on the server (in middleware or a route handler) or on the client (with `useRouter`). **Example:** If a student who isn't logged in visits `/play`, `middleware.js` redirects them to `/auth/sign-in?redirect=/play`. **Non-example:** A `<Link href="/play">Arcade</Link>` — that's a navigation link the user has to click; a redirect happens automatically without user action.

### Deployment
The process of publishing code changes so they go live on the production website. In MathClaw this means pushing to `main` on GitHub, which triggers Vercel to build and host the new version. **Example:** After committing a fix, Vercel detects the new push to `main`, builds the Next.js app, and deploys it to `mathclaw.com`. **Non-example:** Running `npm run dev` locally — that starts a local server only you can see; nothing goes live.

### Leaderboard
A sorted ranking of players by score, usually highest to lowest. In MathClaw it's computed from game session data and shown to students and teachers during play. **Example:** The Double Board session payload includes a `leaderboard` array sorted by points, displayed as the class roster ranking. **Non-example:** A list of all students in a class in alphabetical order — that's a roster, not a leaderboard; it's not sorted by performance.

### Session (Game Session)
A temporary database record that tracks the state of an ongoing game — who's playing, whose turn it is, what questions have been answered, and what the score is. **Example:** A `double_board_sessions` row stores the entire live game: boards, leaderboard, player presence, current turn phase. It's created when a teacher starts a game and updated as students play. **Non-example:** A user's auth session (their login cookie) — that's a different kind of session; it proves who you are, not what game you're playing.

### Anon Key
The public Supabase API key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Safe to expose in the browser because RLS policies limit what unauthenticated (anonymous) users can do. **Example:** Client-side Supabase code uses the anon key; it's included in the JavaScript bundle that ships to every visitor's browser. **Non-example:** The service role key — that key bypasses RLS entirely and must never be exposed in the browser or in client-side code.

### localStorage
A browser API that stores key-value strings on the user's device. Data persists between page reloads but stays local to that browser — no server involved. **Example:** Some MathClaw games use localStorage as a fallback for save-state when a database write isn't available or is too slow. **Non-example:** Supabase `saved_game_progress` table — that's server-side storage; it persists across devices and browsers.

### Cookie
A small piece of data the browser stores and automatically sends with every request to the same domain. Used for authentication — Supabase stores the user's session token in a cookie so the server knows who is making each request. **Example:** The Supabase `createServerClient` in `lib/supabase/server.js` reads and writes auth cookies via `cookieStore.getAll()` and `cookieStore.set()`. **Non-example:** localStorage — that's also browser storage, but cookies are sent to the server automatically; localStorage stays in the browser only.

### Kebab-case vs Snake_case
Two ways to write multi-word identifiers without spaces. Kebab-case uses hyphens (`lowest-number-wins`), snake_case uses underscores (`lowest_number_wins`). In MathClaw, URL routes use kebab-case; database columns, game slugs, and some internal keys use snake_case. **Example:** The route folder is `app/play/lowest-number-wins/` (kebab) but the game slug stored in the database is `"lowest_number_wins"` (snake). **Non-example:** camelCase (`lowestNumberWins`) — that's how JavaScript variable names are written, but not URLs or database column names.
