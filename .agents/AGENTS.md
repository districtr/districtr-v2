# Agent Instructions

> **`.agents/` is the canonical, git-committed directory** for all agent configuration,
> skills, and expert guides. Agent-specific directories (`.claude/`, `.cursor/`, `codex.md`)
> are gitignored sync targets — see [Skills](#skills) below.

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Issue Tracking

This project uses **bd (beads)** for issue tracking.
Run `bd prime` for workflow context, or install hooks (`bd hooks install`) for auto-injection.

**Quick reference:**
- `bd ready` - Find unblocked work
- `bd create "Title" --type task --priority 2` - Create issue
- `bd close <id>` - Complete work
- `bd sync` - Sync with git (run at session end)

For full workflow details: `bd prime`

## Project Structure (CRITICAL)

This is a monorepo with **separate frontend and backend directories**. All code MUST go in the correct directory:

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

**RULES:**
- FastAPI models, views, URLs, management commands → `backend/`
- React components, pages, API clients → `app/`
- NEVER put frontend or backend code at the repo root
- Docker Compose build contexts are `./app` and `./backend`

## Quick Reference

```bash
bd list               # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd update <id> --status done         # Complete work
bd sync               # Sync with git
```

## Skills

`.agents/skills/` is the **canonical, git-tracked** source for all agent skills.
The synced outputs (`.claude/`, `.cursor/`, `codex.md`) are **gitignored** — they are
local-only build artifacts and must never be committed. Always edit skills in
`.agents/skills/`, then run the sync script to distribute them.

```bash
./scripts/sync-skills.sh              # Sync to all agents (Claude, Cursor, Codex)
./scripts/sync-skills.sh --claude     # Claude Code only  → .claude/skills/
./scripts/sync-skills.sh --cursor     # Cursor only       → .cursor/rules/skill-*.mdc
./scripts/sync-skills.sh --codex      # Codex only        → codex.md
./scripts/sync-skills.sh --clean      # Remove all synced files
```

Run this after adding or editing skills in `.agents/skills/`.

## Expert Guides (Read Before Editing)

Expert guides live in `./experts/` and document domain-specific implementation rules. Agents should read the relevant guide(s) before making changes:

- [`DOCKER_EXPERT.md`](./experts/DOCKER_EXPERT.md) - docker-compose topology, env files, local container workflows, quality-gate commands
- [`FE_EXPERT.md`](./experts/FE_EXPERT.md) - frontend architecture and map-first FE conventions
- [`MAP_LAYERS_EXPERT.md`](./experts/MAP_LAYERS_EXPERT.md) - layer stack, sources, map types (district vs COI), style expressions, shatter filters
- [`MAP_RUNTIME_EXPERT.md`](./experts/MAP_RUNTIME_EXPERT.md) - MapLibre interaction model, feature-state, paint/shatter behavior
- [`STATE_SYNC_EXPERT.md`](./experts/STATE_SYNC_EXPERT.md) - IDB/server sync, optimistic concurrency, conflict resolution
- [`WORKERS_EXPERT.md`](./experts/WORKERS_EXPERT.md) - GeometryWorker/ParquetWorker contracts and performance guardrails
- [`BE_EXPERT.md`](./experts/BE_EXPERT.md) - FastAPI + SQLModel conventions and backend architecture
- [`DB_QUERY_AND_MIGRATIONS_EXPERT.md`](./experts/DB_QUERY_AND_MIGRATIONS_EXPERT.md) - SQLAlchemy-first DB patterns, migrations, legacy UDF transition rules
- [`GERRYDB_MAP_LIFECYCLE_EXPERT.md`](./experts/GERRYDB_MAP_LIFECYCLE_EXPERT.md) - map data lifecycle: imports, shatter setup, edges, graph linkage
- [`PIPELINES_EXPERT.md`](./experts/PIPELINES_EXPERT.md) - tiles/tabular/transforms pipeline contracts and toolchain requirements
- [`CMS_MODERATION_EXPERT.md`](./experts/CMS_MODERATION_EXPERT.md) - CMS editing/review and moderation workflows
- [`AUTH_SHARE_SECURITY_EXPERT.md`](./experts/AUTH_SHARE_SECURITY_EXPERT.md) - Auth0 scopes, recaptcha, and share/edit token security

### Guide Selection Rules

- Docker/config/startup/test commands → [`DOCKER_EXPERT.md`](./experts/DOCKER_EXPERT.md)
- Interactive map behavior or rendering changes → [`FE_EXPERT.md`](./experts/FE_EXPERT.md) + [`MAP_RUNTIME_EXPERT.md`](./experts/MAP_RUNTIME_EXPERT.md) + [`MAP_LAYERS_EXPERT.md`](./experts/MAP_LAYERS_EXPERT.md)
- Layer rendering, styling, map types (district vs COI), basemaps, overlays → [`MAP_LAYERS_EXPERT.md`](./experts/MAP_LAYERS_EXPERT.md)
- Worker or large-data FE processing changes → [`WORKERS_EXPERT.md`](./experts/WORKERS_EXPERT.md)
- Sync/conflict/local persistence changes → [`STATE_SYNC_EXPERT.md`](./experts/STATE_SYNC_EXPERT.md)
- Backend endpoint/model/query changes → [`BE_EXPERT.md`](./experts/BE_EXPERT.md) + [`DB_QUERY_AND_MIGRATIONS_EXPERT.md`](./experts/DB_QUERY_AND_MIGRATIONS_EXPERT.md)
- Map onboarding/import/shatter/edge/graph changes → [`GERRYDB_MAP_LIFECYCLE_EXPERT.md`](./experts/GERRYDB_MAP_LIFECYCLE_EXPERT.md) (+ [`PIPELINES_EXPERT.md`](./experts/PIPELINES_EXPERT.md) if artifact generation changes)
- CMS/comment/review changes → [`CMS_MODERATION_EXPERT.md`](./experts/CMS_MODERATION_EXPERT.md) (+ [`AUTH_SHARE_SECURITY_EXPERT.md`](./experts/AUTH_SHARE_SECURITY_EXPERT.md) if protected)

### Backend DB Policy Reminder

- SQLAlchemy-first: prefer SQLAlchemy/SQLModel queries and set-based SQL for new backend logic.
- No new UDFs by default; only introduce one with explicit documented justification.
- Treat existing UDF-backed paths as legacy and prefer incremental migration away when touched.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**Before starting work:**
- Ensure you are on the `dev` branch: most changes should be based on the `dev` branch, which will later be merged into main.
- Check available issues: `bd ready` or `bd list` (if beads is installed)
- Read relevant expert guides (see "Expert Guides" section above)
- Create new issues if needed: `bd create "Description" --type task --priority 2` (if beads is installed)

**MANDATORY WORKFLOW:**

1. **Update issue status** (if beads is installed) - Mark completed work: `bd close <issue-id>` or `bd update <issue-id> --status done`
2. **File issues for remaining work** - Create issues via `bd create` (if beads is installed) or document in commit messages / PR description
3. **Run quality gates** (if code changed) - Tests, linters, builds. Especially `docker-compose up pre-commit` for linting and `docker-compose exec frontend bun run build` for FE and `docker-compose exec backend pytest -v` for BE
4. **Sync Beads** (if beads is installed) - Update issue tracking: `bd sync`
5. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync  # if beads is installed
   git push
   git status  # MUST show "up to date with origin"
   ```
6. **Clean up** - Clear stashes, prune remote branches
7. **Verify** - All changes committed AND pushed
8. **Hand off** - Provide context for next session

> **Note:** Beads (`bd`) is optional. If not installed, skip beads-related steps and track work via git commits, PR descriptions, and GitHub issues instead.

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
- Code MUST BE easy to read and ready for change. Easy to read. Ready for change.

## Troubleshooting

### Beads Issues
**Problem**: `bd: command not found`
**Solution**: Install Beads CLI following https://github.com/steveyegge/beads

**Problem**: `bd list` shows database errors
**Solution**: Run `rm -rf .beads && bd init` to reinitialize

**Problem**: Issues not syncing with git
**Solution**: Run `bd sync` after commits, ensure `.beads/` is tracked

### Docker Issues
**Problem**: `docker-compose up` fails with permission errors
**Solution**: Ensure Docker Desktop is running and you have proper permissions

**Problem**: Backend container won't start (migrations fail)
**Solution**: Check database connectivity: `docker-compose exec db pg_isready -U postgres`

**Problem**: Frontend build fails with module resolution errors
**Solution**: Run `docker-compose exec frontend bun install` to ensure dependencies

### Development Environment
**Problem**: Pre-commit hooks fail
**Solution**: Run `docker-compose up pre-commit` to check linting locally

**Problem**: TypeScript errors in frontend
**Solution**: Run `cd app && bun run ts` to check types

**Problem**: Backend tests fail
**Solution**: Ensure database is running: `docker-compose up -d db`

### Common Workflows
**Problem**: Forgot to create Beads issues for work
**Solution**: Run `bd create "Description" --type task --priority 2` before starting

**Problem**: Changes not reflected in running containers
**Solution**: Use `docker-compose up --build` to rebuild images

**Problem**: Database state inconsistent
**Solution**: Reset with `docker-compose down -v && docker-compose up db`
