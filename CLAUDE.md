# Districtr v2

Community redistricting platform - monorepo with Next.js frontend, FastAPI backend, PostGIS database, and data pipelines.

## Agent Hub

Read [`.agents/AGENTS.md`](.agents/AGENTS.md) for full project context, expert guide selection, quality gates, and session workflow.

## Quick Reference

- **Architecture**: [`.agents/ARCHITECTURE.md`](.agents/ARCHITECTURE.md)
- **Expert guides**: `.agents/experts/` (12 domain-specific guides)
- **Issue tracking**: `bd prime` or `bd ready` (beads CLI, optional)
- **Frontend**: `app/` (Next.js App Router, Bun, TypeScript)
- **Backend**: `backend/` (FastAPI, Python 3.12, SQLModel)
- **Pipelines**: `pipelines/` (tilesets, tabular data, transforms)

## Quality Gates

```bash
docker-compose up pre-commit                    # Lint (Python + JS)
docker-compose exec frontend bun run build      # FE build
docker-compose exec backend pytest -v           # BE tests
```
