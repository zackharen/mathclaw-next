# Lowest Number Wins

## Purpose
Live classroom game where every student simultaneously picks a number greater than zero. Whoever picks the lowest number that no one else picked wins the round. Teacher controls pacing with explicit Start Round / Reveal / Next Round / End Session buttons.

## User Flow
- Teacher opens `/play/lowest-number-wins`, configures number type (integers or positive decimals), creates session
- Students join via `/play/lowest-number-wins` (class-scoped, must be enrolled)
- Teacher starts Round 1 → students see a pick input, submit their number (locked on submit)
- Teacher hits Reveal → winner computed server-side, full breakdown shown with all picks and names
- Teacher starts next round or ends session
- On End, game_sessions rows are written for all students with win counts

## Main Files Involved
- `app/play/lowest-number-wins/page.js`
- `app/play/lowest-number-wins/game-client.js`
- `app/api/play/lowest-number-wins/route.js`
- `supabase/migrations_20260426_lowest_number_wins.sql`

## DB Tables
- `lowest_number_wins_sessions` — session state, current_round, number_type, metadata.rounds (round result history)
- `lowest_number_wins_players` — per-session players with total_wins counter
- `lowest_number_wins_picks` — one row per (session, user, round_number), value stored as numeric

## Session States
`waiting` → `picking` (start_round) → `revealed` (reveal) → `picking` (next_round) → ... → `ended` (end)

## Winner Logic
On reveal, server groups picks by value, finds values with exactly 1 student pick, and the winner is the student with the lowest unique value. If no unique value exists, the round is a draw (no winner). Result stored in `session.metadata.rounds[]`.

## Settings
- `number_type: "integers"` — natural numbers ≥ 1 only
- `number_type: "decimals"` — any positive number > 0, stored up to 4 decimal places

## Polling
Client polls `GET /api/play/lowest-number-wins?sessionId=...` every 2.5 seconds while session is active.

## Historical Data
- `total_wins` column on `lowest_number_wins_players` incremented on each reveal
- `game_sessions` rows (result: "win" or "finished") written once per player on session end
- `upsertGameStats` called for each student on session end

## UI Notes
- Teacher view: session setup → waiting lobby → picking (submit-count display + Reveal button) → revealed (full breakdown + Next Round / End)
- Student view: waiting message → pick form (locked after submit) → results breakdown
- Projector mode: teacher-toggled fullscreen view; shows animated counter during picking, large winner announcement during revealed
- Picks hidden from other students until revealed (enforced server-side; RLS also restricts direct DB access)

## Open Questions / Incomplete Areas
- Migration must be run in Supabase before the game works outside local verification
- No class-roster presence tracking (unlike Double Board) — submission count is based on enrolled students who have joined, not all enrolled students
