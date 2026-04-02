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
│           ├── constants/      # Costants and configuration
│           ├── hooks/          # Custom hooks
│           ├── utils/          # Frontend utilities
│           ├── store/          # Frontend application store/state
│           ├── types/          # TypeScript types
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
├── .devcontainer/          # Dev container configurations
│   ├── backend/            # Backend dev container
│   └── frontend/           # Frontend dev container
├── docker-compose.yml      # Orchestration
```

**RULES:**
- Django models, views, URLs, management commands → `backend/`
- React components, pages, API clients → `app/`
- NEVER put frontend or backend code at the repo root
- Docker Compose build contexts are `./app` and `./backend`

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

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

