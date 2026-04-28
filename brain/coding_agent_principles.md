# Coding Agent Principles

## Purpose

Keep MathClaw coding sessions careful, simple, surgical, and verifiable.

## Principles

### 1. Think Before Coding

- Do not silently assume.
- Before implementing, identify assumptions, ambiguity, risks, and tradeoffs.
- Ask first when ambiguity could cause wrong architecture, wrong data changes, or wasted work.
- Push back when a simpler or safer path fits the request better.

### 2. Simplicity First

- Use the minimum code that solves the requested problem.
- Avoid speculative features, unnecessary abstractions, future-proofing, and giant rewrites.
- Prefer boring, obvious, maintainable code.
- If a solution is getting large, stop and look for the smaller version.

### 3. Surgical Edits Only

- Touch only the files and lines needed for the task.
- Do not refactor unrelated code or clean up unrelated comments, formatting, dead code, or naming unless explicitly asked.
- Match existing project style, even if you would design it differently.
- Every changed line should connect directly to the user's request.

### 4. Goal-Driven Execution

- Before coding, define success criteria and a short verification plan.
- Convert vague requests into measurable outcomes.
- For bugs, reproduce or identify the failure before fixing.
- For features, define the expected user-visible behavior.
- After editing, verify with the smallest useful checks available.

## Session Start Checklist

- Read the relevant brain files.
- Restate the task goal in one sentence.
- Identify assumptions and ambiguity.
- Name the smallest safe implementation path.
- Define success criteria.
- Define verification checks.

## Edit Rules

- Touch only necessary files.
- Preserve existing style.
- Avoid unrelated refactors.
- Remove only dead code caused by your own changes.
- Mention unrelated issues instead of fixing them silently.

## Verification Rules

- Run the smallest useful checks available.
- If checks cannot be run, explain why.
- Compare the result against the original goal.
- Stop when the goal is met; do not add bonus features.

## Final Response Checklist

- State what changed.
- State what was verified.
- State any remaining risks.
- State follow-up only if it is necessary.
