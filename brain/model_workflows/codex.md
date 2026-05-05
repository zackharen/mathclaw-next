# Codex Workflow

## Startup Checklist

1. Read shared core files (project_overview.md, architecture.md, conventions.md, coding_agent_principles.md, file_map.md, session_handoff.md).
2. Read this file (model_workflows/codex.md).
3. Read the Always-On Coordination block below.
4. Use feature_context/INDEX.md to load only the feature context needed for the task.
5. Check whether `localhost:3000` is already running. If no process is listening on port 3000, start the local dev server from `/Users/zackarenstein/mathclaw-next` with `npm run dev`. If port 3000 is already occupied, do not start a duplicate server; verify whether it responds at `http://localhost:3000`, report the result, and ask before restarting the process or changing ports.
6. State: brain files loaded, task goal, files to inspect, files intended for editing.

## Quick Rule

Before starting substantial work, ask: "Would a Codex tool make this safer, faster, or more verifiable?"

Prefer tool use when the task involves:
- live browser behavior
- GitHub pull requests, issues, checks, or review comments
- Vercel deployments, logs, environment variables, or production health
- Supabase data, schema, RLS, migrations, or project settings
- Google Drive, Docs, Sheets, Slides, Gmail, Canva, or external source material
- repeated reminders, follow-ups, monitoring, or scheduled checks
- parallel investigation across independent risk areas
- polished documents, spreadsheets, decks, screenshots, or visual artifacts

## 1. Connectors And Plugins

Use connected apps/plugins when they are available instead of asking the user to manually copy dashboard state into chat.

Good MathClaw uses:
- GitHub: inspect PRs, unresolved review threads, CI status, commit/deployment links, and release history.
- Vercel: inspect deployments, build logs, env vars, domains, preview URLs, and production health.
- Supabase: inspect project state, query data, review schema/RLS risks, and validate migrations.
- Google Drive/Canva: import curriculum outlines, source docs, skill lists, and design briefs.
- Gmail/Calendar: only when the user asks for email, scheduling, reminders, or classroom coordination.

If the connector is not installed or not callable, say so briefly and continue with the best available fallback.

## 2. Browser Verification

For any user-facing UI or classroom-flow change, use browser verification when available. Builds and HTTP 200 checks are not enough for MathClaw games.

Prefer browser checks for:
- teacher/student/projector flows
- responsive layout at desktop and phone widths
- modal behavior, timers, polling, and live state changes
- text overlap, clipped buttons, invalid hydration, or visual regressions
- local routes such as `/play`, `/admin`, `/play/double-board`, `/play/open-middle`, and `/play/lowest-number-wins`

When auth blocks browser verification, report exactly what was blocked and what partial checks still ran.

## 3. Automations

Use Codex automations for reminders, monitors, and follow-ups instead of leaving everything as handoff bullets.

Strong MathClaw automation candidates:
- remind to run pending Supabase migrations
- remind to rotate exposed keys
- check production or staging health on a schedule
- follow up after live classroom playtests
- revisit owner-login verification after credentials or saved browser state are available

Do not create an automation silently. Propose or create it only when the user asks for a reminder, monitor, follow-up, or recurring check.

## 4. Subagents

Use subagents only when the user explicitly asks for parallel agents, delegation, or multiple agents. When authorized, split independent work by risk area.

Good splits:
- UI/browser playtest
- API/server logic review
- Supabase/RLS/migration review
- deployment/CI investigation
- docs/handoff update

Give each subagent a bounded task and, for code changes, a disjoint file ownership area. Do not use subagents for the immediate blocking task when doing it locally would be faster.

## 5. Review Mode

When the user asks for a review, default to finding bugs and risks, not summarizing the code. Lead with findings and line references.

Use review mode especially for:
- auth/account-type changes
- RLS policies and security-definer functions
- migrations and production-schema fallbacks
- polling/timer code in live games
- saved-state/auth metadata changes
- deployment workflow changes

If no issues are found, say that clearly and mention remaining test gaps.

## 6. Skills

Use Codex skills when the task matches one. Skills are reusable local procedures and should eventually replace fragile long-form prompt instructions for repeated workflows.

MathClaw workflows that may deserve future custom skills:
- `USH`: update session handoff only
- `USHM`: verify, commit, push, deploy/promote, then update handoff
- live classroom game playtest
- Supabase migration safety review
- Vercel deployment verification
- MathClaw brain maintenance
- "LU" implementation-prompt generation

Until custom skills exist, keep the corresponding brain protocols concise and explicit.

## 7. Artifacts And Documents

Use Codex document/spreadsheet/presentation capabilities when the output should be a polished artifact, not just markdown notes.

Good uses:
- turn the vocabulary bank into a teacher-facing handout
- convert future ideas into a roadmap table
- build a playtest checklist spreadsheet
- create a slide deck for a MathClaw feature pitch
- import and structure curriculum content from Drive or Canva

Keep generated artifacts under the project or a clear user-approved location.

## 8. Permission-Aware Work

When a needed file, app, network target, or dashboard is outside the current sandbox, request the narrowest permission needed and explain why.

Do not work around missing permission with risky manual steps. If permission is not granted, continue with the safest partial analysis and state the limitation.

## Delivery Mechanics

Codex is the default closer for production shipping. When carrying work live:
- Use GitHub connector for PR status, CI checks, and commit verification.
- Use Vercel connector for deployment status, build logs, and production URL confirmation.
- Use Supabase connector for migration verification and schema/RLS checks.
- Confirm the live URL responds before updating session_handoff.md as shipped.
- Report the commit hash, deployment ID, and live URL in the handoff update.

## Verification Ladder

Use the smallest ladder that fits the risk:
1. Static/code inspection for narrow docs or copy changes.
2. Focused tests for shared logic or engine behavior.
3. Build check for route/component/app changes.
4. Browser verification for user-facing UI and live classroom flows.
5. GitHub/Vercel/Supabase connector checks for production shipping, migrations, or deployment uncertainty.
6. Automation or handoff update for anything that remains intentionally deferred.

## Always-On Coordination Rules

These rules apply in every session, not only when multi-agent work is announced:

- Before editing, state intent: which files will be inspected and which files are expected to change.
- Check git status and recent diffs before editing, especially if Claude may have been active.
- Prefer single-owner file sets per task — avoid editing files that belong to an in-progress Claude task.
- Do not silently overwrite or rewrite another agent's recent work. If file ownership conflicts exist, stop and flag the conflict to the user.
- If uncertain whether ownership is stale, ask Zack before editing those files.
- Production promotion and deployment belong to Codex by default. Do not let both agents independently push or promote.
