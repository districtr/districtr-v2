# Agent Instructions

> **`.agents/` is the canonical, git-committed directory** for all agent configuration
> and skills (including project guides). Agent-specific directories (`.claude/`, `.cursor/`, `codex.md`)
> are gitignored sync targets — see [Skills](#skills) below.

## Issue Tracking

**bd (beads >=1.0.0, optional)** tracks all work — never ad-hoc TODO lists. Claude
sessions get the full command reference and session-close protocol injected by the
SessionStart hook; other agents (and humans) run `bd prime` for the same. Install:
`brew install steveyegge/beads/bd`.

## Project Structure

```
/                                # Repo root
├── app/                         # Next.js frontend (Bun runtime)
│   ├── Dockerfile.dev
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── src/
│       └── app/                 # Next.js app router root
│           ├── (interactive)/   # Route group: map viewer/editor pages
│           │   └── map/         #   /map, /map/[map_id], /map/edit/*
│           ├── (static)/        # Route group: static content pages
│           │   └── ...          #   /about, /guide, /places, /contact, etc.
│           ├── admin/           # Admin panel pages (Auth0-protected)
│           ├── components/      # React components
│           ├── constants/       # Constants and configuration
│           ├── hooks/           # Custom hooks
│           ├── lib/             # Auth0 and shared libraries
│           ├── store/           # Zustand stores, subscriptions, middleware
│           └── utils/           # Workers, API handlers, map helpers, IDB
├── backend/                     # FastAPI backend (Python)
│   ├── Dockerfile.dev
│   ├── cli.py                   # Management CLI (imports, map creation, edges)
│   ├── requirements.txt
│   └── app/
│       ├── alembic/             # Alembic DB migrations
│       ├── assignments/         # Zone assignments management
│       ├── cms/                 # Content management endpoints
│       ├── comments/            # Comments + moderation API
│       ├── contiguity/          # Geographic spatial contiguity
│       ├── core/                # DB, config, security, dependencies
│       ├── exports/             # Export data functions
│       ├── save_share/          # Save/share and password-protected access
│       ├── sql/                 # Legacy UDF SQL files (do not expand)
│       ├── thumbnails/          # Map thumbnail generation
│       ├── models.py            # SQLModel/SQLAlchemy models
│       └── main.py              # FastAPI entrypoint
├── pipelines/                   # Data pipelines (tilesets, tabular, transforms)
├── docker-compose.yml           # Orchestration
└── .env.example                 # Root env flags (LOAD_DATA, etc.)
```

## Skills

`.agents/skills/` is the **canonical, git-tracked** source for all agent skills.
The synced outputs (`.claude/`, `.cursor/`, `codex.md`) are **gitignored** — they are
local-only build artifacts and must never be committed. Always edit skills in
`.agents/skills/`, then run the sync script to distribute them. Read
[`skills/AUTHORING.md`](./skills/AUTHORING.md) before writing or revising a skill —
it covers how skills load, how they're individuated (one skill per concern, not per
file surface), and what content works.

```bash
./scripts/sync-skills.sh              # Sync to all agents (Claude, Cursor, Codex)
./scripts/sync-skills.sh --claude     # Claude Code only  → .claude/skills/
./scripts/sync-skills.sh --cursor     # Cursor only       → .cursor/rules/skill-*.mdc
./scripts/sync-skills.sh --codex      # Codex only        → codex.md
./scripts/sync-skills.sh --clean      # Remove all synced files
```

Run this after adding or editing skills in `.agents/skills/`. The Claude output is
flat (`.claude/skills/<name>/`) regardless of source grouping — Claude Code discovers
skills one level deep only, and routes to them by their frontmatter `description`.

## Project Skills

Project skills live directly in `.agents/skills/`, in two kinds. Orientation — what
the system is, what the words mean, how the pieces fit — is deliberately **not** in
skills: read [`docs/overview.md`](../docs/overview.md) (the shape of the project) and
[`docs/decisions.md`](../docs/decisions.md) (dated architectural decisions and their
grounds) instead.

**Norm skills** — project norms and vocabulary the repository can't state about
itself, loaded when working in their situations:

- [`backend-endpoints`](./skills/backend-endpoints/SKILL.md) - backend route/model/query constraints: SQLAlchemy-first, the shattered-parent contract, the document-UUID boundary
- [`map-rendering`](./skills/map-rendering/SKILL.md) - the map-feels-synchronous value and its consequences; shatter/Break vocabulary
- [`map-edit-sync`](./skills/map-edit-sync/SKILL.md) - the two "last updated" clocks and derived local-edit detection
- [`performance-memory`](./skills/performance-memory/SKILL.md) - the district graph as the expensive resource
- [`deploy-authority`](./skills/deploy-authority/SKILL.md) - live infra changes only through post-merge CI (paths-gated on `infra/**` and workflows)

**Runbooks** (`run-*`) — invoke to perform a procedure:

- [`run-quality-gate`](./skills/run-quality-gate/SKILL.md) - run the verification suite, scoped to the diff, expensive gates concurrent
- [`run-map-onboarding`](./skills/run-map-onboarding/SKILL.md) - onboard a new geographic layer end to end
- [`run-migration`](./skills/run-migration/SKILL.md) - author and validate an Alembic migration
- [`run-api-contract-audit`](./skills/run-api-contract-audit/SKILL.md) - detect drift between frontend API types and backend schemas
- [`run-dependency-audit`](./skills/run-dependency-audit/SKILL.md) - survey outdated/vulnerable dependencies

In Claude Code, routing is automatic — each skill's description states its situation
and the model loads it when relevant. The listing above is the map for humans and for
agents (Cursor, Codex) without native skill routing.

## Session Completion

Base work on the `dev` branch. When ending a session: close/update bd issues and
file follow-ups; run the quality gates for whatever the diff touched (see
`run-quality-gate`); then `git pull --rebase && git push` — work is complete only
when `git status` shows up to date with origin. Never stop before pushing, and
never hand the push back to the human.
