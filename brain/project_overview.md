# Project Overview

MathClaw is a Next.js/Supabase math practice and classroom-game app for teachers, students, and independent arcade players.

## Core Audiences

- `teacher`: manages classes, launches classroom activities, and uses teacher/admin workspace surfaces.
- `student`: joins classes and plays assigned or class-scoped activities.
- `player`: independent arcade user who can play without a class.
- Owner/admin access is separate from account type and is controlled by owner/admin helpers.

## Main Product Areas

- Public shell: homepage, about page, auth, onboarding, nav/header, and editable site copy.
- Teacher workspace: class creation, class management, teacher discovery, and class-scoped game access.
- Student arcade: `/play` hub with classes, group activities, skill games, awards/extra credit, and question creation.
- Admin: user information, diagnostics, bug reports, editable site copy, feature rollout controls, and mastery settings.
- Live classroom games: Double Board, Lowest Number Wins, Open Middle, Connect 4, and related game flows.
- Adaptive practice: Integer Practice progression engine and owner-managed mastery tuning.
- Infrastructure: Supabase auth/database/RLS, Vercel deployment, local/staging/production environments, and brain docs.

## Current Product Shape

- The app is JavaScript-first and uses the Next.js App Router.
- Supabase provides auth, Postgres storage, RLS, RPCs, and admin/service-role operations.
- Vercel hosts production and previews; production and preview environments map to separate Supabase projects.
- Local development uses `.env.local`; staging uses `.env.staging.local` and the `staging` branch.
- The `/brain` folder is the compact working memory for future AI sessions.

## Highest-Risk Areas

- Auth metadata and saved-state handling, especially anything that can inflate cookies/headers.
- Account-type fallbacks because production schema and legacy accounts may lag the repo.
- Supabase migrations, RLS policies, and security-definer functions.
- Live game polling/timer behavior and teacher/student/projector synchronization.
- Deployment promotion and environment-variable correctness.

## Current Source Of Truth

- Current status and next steps: `brain/session_handoff.md`.
- Code style and product conventions: `brain/conventions.md`.
- Agent behavior and verification discipline: `brain/coding_agent_principles.md`.
- Model-specific workflows: `brain/model_workflows/codex.md` (Codex) and `brain/model_workflows/claude.md` (Claude Code).
- Multi-agent coordination: `brain/model_workflows/coordination.md`.
- Feature-specific context: `brain/feature_context/INDEX.md`.
