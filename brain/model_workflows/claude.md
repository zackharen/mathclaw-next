# Claude Code Workflow

## Startup Checklist

1. Read shared core files (project_overview.md, architecture.md, conventions.md, coding_agent_principles.md, file_map.md, session_handoff.md).
2. Read this file (model_workflows/claude.md).
3. Read the Always-On Coordination block below.
4. Use feature_context/INDEX.md to load only the feature context needed for the task.
5. Check git status and recent commits — if another agent has been active, inspect diffs before editing anything.
6. State: brain files loaded, task goal, files to inspect, files intended for editing.
7. For large-scope or cross-cutting changes, produce an LU-style implementation prompt rather than editing directly — let a new session or Codex execute it.
8. Do not own deployment or production promotion unless the user explicitly assigns it.

## Operating Strengths

Lean into these when deciding how to approach a task:

- Deep codebase reading and synthesis across many files.
- Architecture critique and tradeoff reasoning.
- Refactor planning and implementation strategy.
- Second-opinion review of proposed changes.
- Generating fully-specified LU-style implementation prompts for Codex or new sessions.
- Large-context reasoning about feature fit, edge cases, and data/auth risks.
- Careful review of whether a proposed change fits the project's shape and conventions.

Either model may implement when assigned. In a two-agent workflow, prefer Claude for deep planning and review and Codex for tool-connected verification and shipping, unless Zack explicitly assigns otherwise.

## Verification Approach

Claude does not have browser connectors or plugin access. When verifying:

- Use static code review, targeted test runs, and build checks when appropriate.
- If user-facing UI or live classroom flow verification is needed before shipping, flag the work explicitly for Codex browser verification.
- Do not claim user-facing UI or live-flow work is fully done unless the required verification has occurred or the limitation is clearly stated.

The project's shared verification expectation applies: UI and live classroom-flow changes require user-facing verification before being considered done. The verification method depends on the active model, available tools, auth access, and risk level. If full verification is blocked, state what was checked and what remains unverified.

## Delivery Expectation

- The project's delivery expectation applies: fix/build/change requests are expected to reach the live site unless the user says otherwise (see conventions.md → Delivery Convention).
- In a two-agent workflow, do not assume ownership of deployment or production promotion — that is Codex's default role.
- When producing an LU handoff prompt for Codex, include verification steps and a deployment reminder in the prompt.

## Always-On Coordination Rules

These rules apply in every session, not only when multi-agent work is announced:

- Before editing, state intent: which files will be inspected and which files are expected to change.
- Check git status and recent diffs before editing, especially if Codex may have been active.
- Prefer single-owner file sets per task — avoid editing files that belong to an in-progress Codex task.
- Do not silently overwrite or rewrite another agent's recent work. If file ownership conflicts exist, stop and flag the conflict to the user.
- If uncertain whether ownership is stale, ask Zack before editing those files.
- Production promotion and deployment belong to Codex by default unless the user explicitly assigns them elsewhere.
