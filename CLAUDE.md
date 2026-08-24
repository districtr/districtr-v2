# Districtr v2

Community redistricting platform - monorepo with Next.js frontend, FastAPI backend, PostGIS database, and data pipelines.

## Agent Hub

Read [`.agents/AGENTS.md`](.agents/AGENTS.md) for full project context, guide selection, quality gates, and session workflow.

## Quick Reference

- **Architecture**: [`.agents/ARCHITECTURE.md`](.agents/ARCHITECTURE.md)
- **Project guides**: `.agents/skills/project/` (12 domain-specific guides)
- **Issue tracking**: `bd prime` or `bd ready` (beads CLI >=1.0.0, optional)
- **Frontend**: `app/` (Next.js App Router, Bun, TypeScript)
- **Backend**: `backend/` (FastAPI, Python 3.12, SQLModel)
- **Pipelines**: `pipelines/` (tilesets, tabular data, transforms)

## Quality Gates

Cheap checks (seconds — run on every relevant change):
```bash
docker-compose up pre-commit                    # ruff + Prettier formatting (Python + JS)
cd app && bun run ts                            # TS typecheck (~2-3s)
```

Expensive checks (~80-95s each — once per PR before push, only when the diff touches
the relevant side, run concurrently rather than serially when both are needed):
```bash
docker-compose exec frontend bun run build      # FE build (app/ changes)
docker-compose exec backend pytest -v           # BE tests (backend/ changes)
```

`cd app && bun run lint` (ESLint) also runs (~7-9s) — available for manual use, not part of
the routine gates above or wired into pre-commit. The team has decided not to lean on
linting for this codebase; this fixes the script (it was broken, not disabled by choice)
without making it a gate.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
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
<!-- END BEADS INTEGRATION -->
