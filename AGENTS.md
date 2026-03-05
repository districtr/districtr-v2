# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Project Structure (CRITICAL)

This is a monorepo with **separate frontend and backend directories**. All code MUST go in the correct directory:

```
/                           # Repo root
├── app/               # Next.js app (all frontend code here)
│   ├── Dockerfile.dev
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── components.json
│   ├── eslint.config.mjs
│   ├── postcss.config.mjs
│   └── src/
│       ├── app/            # Next.js app router
│           ├── components/     # React components
│           ├── constants/      # Constants and configuration
│           ├── hooks/          # Custom hooks
│           ├── utils/          # Frontend utilities
│           ├── store/          # Frontend application store/state
│           ├── admin/          # Admin panel pages
│           ├── lib/            # Auth0 and shared libraries
├── backend/                # FastAPI app (all backend code here)
│   ├── Dockerfile.dev
│   ├── cli.py
│   ├── requirements.txt
│   └── app/                # FastAPI app goes here
│       ├── alembic/            # Alembic DB migrations
│       ├── assignments/        # Zone assignments management
│       ├── cms/                # Content management endpoints
│       ├── comments/           # Comments API endpoints
│       ├── contiguity/         # Geographic spatial contiguity
│       ├── core/               # Shared core functions
│       ├── exports/            # Export data functions
│       ├── save_share/         # Save and share (eg password) functions
│       ├── thumbnails/         # Map thumbnail generation
│       └── main.py             # Main entrypoint
├── docker-compose.yml      # Orchestration
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

## Expert Guides (Read Before Editing)

This repo has root-level expert docs for domain-specific implementation rules. Agents should read the relevant guide(s) before making changes:

- `DOCKER_EXPERT.md` - docker-compose topology, env files, local container workflows, quality-gate commands
- `FE_EXPERT.md` - frontend architecture and map-first FE conventions
- `MAP_RUNTIME_EXPERT.md` - MapLibre interaction model, feature-state, paint/shatter behavior
- `STATE_SYNC_EXPERT.md` - IDB/server sync, optimistic concurrency, conflict resolution
- `WORKERS_EXPERT.md` - GeometryWorker/ParquetWorker contracts and performance guardrails
- `BE_EXPERT.md` - FastAPI + SQLModel conventions and backend architecture
- `DB_QUERY_AND_MIGRATIONS_EXPERT.md` - SQLAlchemy-first DB patterns, migrations, legacy UDF transition rules
- `GERRYDB_MAP_LIFECYCLE_EXPERT.md` - map data lifecycle: imports, shatter setup, edges, graph linkage
- `PIPELINES_EXPERT.md` - tiles/tabular/transforms pipeline contracts and toolchain requirements
- `CMS_MODERATION_EXPERT.md` - CMS editing/review and moderation workflows
- `AUTH_SHARE_SECURITY_EXPERT.md` - Auth0 scopes, recaptcha, and share/edit token security

### Guide Selection Rules

- Docker/config/startup/test commands → `DOCKER_EXPERT.md`
- Interactive map behavior or rendering changes → `FE_EXPERT.md` + `MAP_RUNTIME_EXPERT.md`
- Worker or large-data FE processing changes → `WORKERS_EXPERT.md`
- Sync/conflict/local persistence changes → `STATE_SYNC_EXPERT.md`
- Backend endpoint/model/query changes → `BE_EXPERT.md` + `DB_QUERY_AND_MIGRATIONS_EXPERT.md`
- Map onboarding/import/shatter/edge/graph changes → `GERRYDB_MAP_LIFECYCLE_EXPERT.md` (+ `PIPELINES_EXPERT.md` if artifact generation changes)
- CMS/comment/review changes → `CMS_MODERATION_EXPERT.md` (+ `AUTH_SHARE_SECURITY_EXPERT.md` if protected)

### Backend DB Policy Reminder

- SQLAlchemy-first: prefer SQLAlchemy/SQLModel queries and set-based SQL for new backend logic.
- No new UDFs by default; only introduce one with explicit documented justification.
- Treat existing UDF-backed paths as legacy and prefer incremental migration away when touched.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds. Especially `docker-compose up pre-commit` for linting and `docker-compose exec frontend bun run build` for FE and `docker-compose exec backend pytest -v` for BE
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
- Code MUST BE easy to read and ready for change. Easy to read. Ready for change.
