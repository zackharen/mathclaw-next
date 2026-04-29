# MathClaw Brain Start Here

Use this file as the single stable entrypoint for new AI conversations.

## Recommended Reusable Prompt
Use the MathClaw brain entrypoint at `/Users/zackarenstein/mathclaw-next/brain/START_HERE.md` and follow it exactly.

## Startup Workflow
1. Read only these base files first:
   - `/Users/zackarenstein/mathclaw-next/brain/project_overview.md`
   - `/Users/zackarenstein/mathclaw-next/brain/architecture.md`
   - `/Users/zackarenstein/mathclaw-next/brain/conventions.md`
   - `/Users/zackarenstein/mathclaw-next/brain/coding_agent_principles.md`
   - `/Users/zackarenstein/mathclaw-next/brain/file_map.md`
   - `/Users/zackarenstein/mathclaw-next/brain/session_handoff.md`
2. Use `/Users/zackarenstein/mathclaw-next/brain/feature_context/INDEX.md` to identify the minimum relevant files in `/Users/zackarenstein/mathclaw-next/brain/feature_context/`.
3. Load only the feature context files needed for the task.
4. Avoid loading unrelated context.
5. Before making code changes, state which brain files were used.
6. Tell the user which code files you plan to inspect first.
7. Check whether `localhost:3000` is already running. If no process is listening on port 3000, start the local dev server from `/Users/zackarenstein/mathclaw-next` with `npm run dev`. If port 3000 is already occupied, do not start a duplicate server; verify whether it responds at `http://localhost:3000`, report the result, and ask before restarting the process or changing ports.

## Working Rules
- Preserve existing project conventions, UI patterns, and structure.
- Follow `/Users/zackarenstein/mathclaw-next/brain/coding_agent_principles.md` before editing code.
- Keep edits minimal, precise, and high-signal.
- Do not invent unsupported features.
- Unless the user explicitly says otherwise, treat requests to fix/build/change something as requests to carry the change through to the live site, not just local code changes.
- For changes intended to go live, avoid leaving the work only on a side branch; finish the workflow needed for the production branch/deployment path unless the user asks to stop earlier.
- Be careful with auth metadata, saved-state changes, and production-schema fallbacks.
- Do not touch `/Users/zackarenstein/mathclaw-next/supabase/migrations_20260331_join_course_by_code_rpc.sql` unless explicitly asked.
- Update `/Users/zackarenstein/mathclaw-next/brain/session_handoff.md` after work that changes project state, priorities, or known issues.

## Reference Docs
- `/Users/zackarenstein/mathclaw-next/brain/features.md` is a broad catalog, not part of the default startup path.
- `/Users/zackarenstein/mathclaw-next/brain/current_priorities.md` is a broad roadmap snapshot, not part of the default startup path.
- `/Users/zackarenstein/mathclaw-next/brain/future_ideas.md` is the future ideas / todo bank. Load it when the user asks about future ideas, backlog, roadmap candidates, todo items, or asks to reference the bank.
- Prefer `session_handoff.md` for current status and `feature_context/INDEX.md` for task routing.

## `USH` Rule
If the user types `USH`, update only `/Users/zackarenstein/mathclaw-next/brain/session_handoff.md` with a concise handoff summary unless explicitly asked for more.

## `USHM` Rule
If the user types `USHM`, push all local changes live, then update `/Users/zackarenstein/mathclaw-next/brain/session_handoff.md` with a concise handoff summary.

Treat `USHM` as explicit approval to:
1. Review the current branch, local changes, and deployment state.
2. Run the smallest useful verification checks before shipping.
3. Commit local changes with a clear message if needed.
4. Merge/promote the work to `main` when not already on `main`.
5. Push `main` and deploy/promote to the production site using the normal MathClaw workflow.
6. Confirm the live site/deployment result when tools and permissions allow.
7. Update `session_handoff.md` with what changed, what is in progress, and known issues.

Do not run destructive commands for `USHM` (for example `git reset --hard`, force pushes, or schema-destructive database commands) unless the user explicitly adds that instruction.
