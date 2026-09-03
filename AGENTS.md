# Districtr v2

Community redistricting platform - monorepo with Next.js frontend, FastAPI backend, PostGIS database, and data pipelines.

## Agent Hub

Read [`.agents/AGENTS.md`](.agents/AGENTS.md) for full project context, guide selection, quality gates, and session workflow.

## Quick Reference

- **Architecture**: [`.agents/ARCHITECTURE.md`](.agents/ARCHITECTURE.md)
- **Orientation**: [`docs/overview.md`](docs/overview.md) (project shape, name concordance) · [`docs/decisions.md`](docs/decisions.md) (dated architectural decisions)
- **Project skills**: `.agents/skills/` (5 norm skills + 5 `run-*` runbooks; see `.agents/skills/AUTHORING.md`)
- **Issue tracking**: `bd prime` or `bd ready` (beads CLI >=1.0.0, optional)

## Cross-Cutting Rules

- **The document UUID is the edit capability** — possession grants edit rights; treat
  it as a secret.
- **Frontend tooling is Bun** — `bun install` / `bun run`, never npm/npx.

## Quality Gates

```bash
docker-compose up pre-commit                    # Lint (Python + JS)
docker-compose exec frontend bun run build      # FE build
docker-compose exec backend pytest -v           # BE tests
```


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

Track all tasks with **bd (beads)** — never TodoWrite/TaskCreate/markdown TODOs.
The SessionStart hook injects the full command reference and session-close
protocol (`bd prime`) into every session; follow that protocol when ending a
session — work is complete only after `git push` succeeds.
<!-- END BEADS INTEGRATION -->
