# MathClaw Brain Start Here

Use this file as the single stable entrypoint for new AI conversations.

## Recommended Reusable Prompts

### Codex
Use the MathClaw brain entrypoint at `/Users/zackarenstein/mathclaw-next/brain/START_HERE.md` and follow it exactly. You are Codex. Load the Codex workflow overlay at `/Users/zackarenstein/mathclaw-next/brain/model_workflows/codex.md`.

### Claude Code
Use the MathClaw brain entrypoint at `/Users/zackarenstein/mathclaw-next/brain/START_HERE.md` and follow it exactly. You are Claude Code. Load the Claude workflow overlay at `/Users/zackarenstein/mathclaw-next/brain/model_workflows/claude.md`.

### Multi-Agent / Back-And-Forth
Use the MathClaw brain entrypoint at `/Users/zackarenstein/mathclaw-next/brain/START_HERE.md` and follow it exactly. Load your model-specific workflow overlay. Also load `/Users/zackarenstein/mathclaw-next/brain/model_workflows/coordination.md` because this task involves Codex/Claude coordination.

## Startup Workflow

1. Read only these shared base files first:
   - `/Users/zackarenstein/mathclaw-next/brain/project_overview.md`
   - `/Users/zackarenstein/mathclaw-next/brain/architecture.md`
   - `/Users/zackarenstein/mathclaw-next/brain/conventions.md`
   - `/Users/zackarenstein/mathclaw-next/brain/coding_agent_principles.md`
   - `/Users/zackarenstein/mathclaw-next/brain/file_map.md`
   - `/Users/zackarenstein/mathclaw-next/brain/session_handoff.md`
2. Load the active model's workflow overlay:
   - Codex: `/Users/zackarenstein/mathclaw-next/brain/model_workflows/codex.md`
   - Claude Code: `/Users/zackarenstein/mathclaw-next/brain/model_workflows/claude.md`
   - Other agents: read START_HERE.md, then ask which overlay to use if unclear.
3. If the task involves multiple agents, handoff, critique from the other model, or back-and-forth, also load:
   - `/Users/zackarenstein/mathclaw-next/brain/model_workflows/coordination.md`
4. Use `/Users/zackarenstein/mathclaw-next/brain/feature_context/INDEX.md` to identify the minimum relevant files in `/Users/zackarenstein/mathclaw-next/brain/feature_context/`.
5. Load only the feature context files needed for the task.
6. Before making code changes, state:
   - which brain files were used
   - task goal
   - assumptions or ambiguity
   - code files planned for inspection
   - code files likely to be edited
7. Follow the active model overlay for dev-server checks, browser verification, connectors, deployment behavior, and model-specific workflow rules.

## Working Rules
- Preserve existing project conventions, UI patterns, and structure.
- Follow `/Users/zackarenstein/mathclaw-next/brain/coding_agent_principles.md` before editing code.
- Use your model's workflow overlay to decide when tools, browser verification, automations, subagents, review mode, or permission requests would make the work safer or more complete.
- Keep edits minimal, precise, and high-signal.
- Do not invent unsupported features.
- Standing delivery instruction from Zack: always carry fix/build/change work through to the live MathClaw site unless Zack explicitly says not to. Assume "make it live" for future sessions.
- Do not leave completed work only as local edits, a side branch, or an unpromoted preview when it is safe and possible to ship. Finish the production branch/deployment path unless Zack asks to stop earlier.
- Be careful with auth metadata, saved-state changes, and production-schema fallbacks.
- Do not touch `/Users/zackarenstein/mathclaw-next/supabase/migrations_20260331_join_course_by_code_rpc.sql` unless explicitly asked.
- Update `/Users/zackarenstein/mathclaw-next/brain/session_handoff.md` after work that changes project state, priorities, or known issues.

## Reference Docs
- `/Users/zackarenstein/mathclaw-next/brain/features.md` is a broad catalog, not part of the default startup path.
- `/Users/zackarenstein/mathclaw-next/brain/current_priorities.md` is a broad roadmap snapshot, not part of the default startup path.
- `/Users/zackarenstein/mathclaw-next/brain/future_ideas.md` is the future ideas / todo bank. Load it when the user asks about future ideas, backlog, roadmap candidates, todo items, or asks to reference the bank.
- Prefer `session_handoff.md` for current status and `feature_context/INDEX.md` for task routing.

## `vocab` Rule
If the user types `vocab`, follow the `vocab` protocol defined in `conventions.md` → Command Shortcuts → `vocab`: pick 3 words from `brain/education/vocabulary.md` that haven't been shown yet in this conversation, and display each one with its name, definition, an example, and a non-example. Rotate through the list so different words appear each time.

## `USH` Rule
If the user types `USH`, update only `/Users/zackarenstein/mathclaw-next/brain/session_handoff.md` with a concise handoff summary unless explicitly asked for more.

## `LU` Rule
If the user types `LU` followed by notes or requested changes, follow the `LU` protocol defined in `conventions.md` → Command Shortcuts → `LU`: read relevant brain/feature context, ask numbered clarifying questions one at a time, then produce a fully-specified implementation prompt in a code block for a new chat session to execute. The prompt must specify which model will execute it and include the appropriate model-specific startup instruction (Codex or Claude Code overlay).

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
