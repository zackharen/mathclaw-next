# Coordination Protocol

Load this file when the task involves Codex + Claude coordination, handoffs, critique from the other model, or explicit back-and-forth between agents.

The always-on coordination rules (state intent, check git before editing, single-owner file sets, no silent overwrites, Codex owns deployment by default) live in each model's overlay and apply in every session. This file covers the deeper protocol for active multi-agent work.

## Multi-Agent Ownership Protocol

- Before editing, each agent states intent: brain files loaded, task goal, files to inspect, files to edit.
- Prefer single-owner file sets per task — one agent owns each set of files per task.
- Do not silently overwrite or rewrite another agent's recent work.
- If file ownership conflicts exist, stop and flag the conflict to Zack with a summary of what each agent changed.
- One agent owns shipping per task. Do not let both independently push or promote.
- Production promotion and deployment belong to Codex by default unless Zack explicitly assigns them elsewhere.

## Active File Ownership

Track in-progress file ownership using a short section in `session_handoff.md`.

Format when active:
```
## Active File Ownership
- Owner: [Claude / Codex]
- Editing: [file paths]
- Reason: [brief description]
- Other agents: inspect diff and ask Zack before editing these files
```

When no active ownership:
```
## Active File Ownership
- None currently.
```

Lifecycle rules:
- The model that starts a task sets the Active File Ownership section when it begins editing.
- The model that completes the task clears the section when updating `session_handoff.md` at end of session.
- If the session ends without completion, leave the section populated.
- If it is more than one session old and clearly no longer reflects active work, either model may clear it while updating `session_handoff.md`.
- If uncertain whether ownership is stale, ask Zack before clearing or editing those files.

## Claude→Codex Handoff (LU-Style)

Use this when Claude has done the planning and Codex will execute. This is the canonical format for handing executable work from Claude to Codex.

A Claude→Codex handoff is a single code block containing:

1. Standard brain entrypoint instruction — `Use the MathClaw brain entrypoint at /Users/zackarenstein/mathclaw-next/brain/START_HERE.md and follow it exactly. You are Codex. Load the Codex workflow overlay at /Users/zackarenstein/mathclaw-next/brain/model_workflows/codex.md.`
2. Relevant feature context files to load.
3. Exact goal (one clear sentence).
4. Files likely involved (paths).
5. Precise behavior changes — specific enough that no follow-up questions are needed (include file names, function names, line number hints, and exact behavior).
6. Constraints and danger zones (auth patterns, RLS, migrations, known issues, production-schema fallbacks).
7. Verification steps (what to check before claiming done, including what level of verification is expected).
8. Delivery reminder — carry through to live site per delivery convention, confirm live URL.
9. `session_handoff.md` update reminder.

## Codex→Claude Critique Handoff

Use this when Codex has done implementation and wants Claude's review.

A Codex→Claude critique handoff contains:

**What was built or changed:**
- Files changed
- Behavior changed
- Important implementation details

**What Codex is uncertain about:**
- Edge cases
- Architecture fit
- Data/auth risks
- UI or classroom-flow risks

**Specific questions for Claude (numbered):**
- Ask specific questions, not vague "thoughts?"

**Constraints Claude should know:**
- Danger zones, migrations, deployment state, known issues, recent file ownership

**Desired Claude output (specify one):**
- Written critique only
- Implementation plan
- LU-style reimplementation prompt for a new session
- Targeted patch proposal

## Conflict Handling

If both agents have recently edited overlapping files:
1. Stop before making further edits.
2. Run `git diff` and `git log` to understand the delta.
3. Flag the conflict to Zack with a summary of what each agent changed.
4. Ask how to resolve before proceeding.

## Session Handoff Updates

After any meaningful state change, the active agent updates `session_handoff.md`:
- Move completed work into "What Was Built."
- Update "Current State Of The Project" to reflect now.
- Update or clear "Active File Ownership."
- Update "Next Recommended Steps."
