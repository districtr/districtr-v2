# Districtr v2

Community redistricting platform - monorepo with Next.js frontend, FastAPI backend, PostGIS database, and data pipelines.

## Quick Reference

- **Architecture**: [`docs/architecture.md`](docs/architecture.md)
- **Orientation**: [`docs/overview.md`](docs/overview.md) (newcomer tour — project shape, name concordance) · [`docs/adr/`](docs/adr/README.md) (dated architectural decision records)
- **Project skills**: `agent-skills/`
- **Issue tracking**: `bd prime` or `bd ready` (beads CLI >=1.0.0, optional)

## Cross-Cutting Rules

- **The document UUID is the edit capability** — possession grants edit rights; treat it as a secret.
- **Frontend tooling is Bun** — `bun install` / `bun run`, never npm/npx.
- **Base work on `dev`** — changes branch from and merge to `dev`; `main` is release.

## Quality Gates

Lint, FE build, BE tests — the `run-quality-gate` skill (`agent-skills/run-quality-gate/`) says which gates a situation calls for and the commands.


## Testing Policy

Test **boundaries and decisions, never configuration**:

- ALWAYS test: the JWT/crypto contract between cms and backend, team-scoping
  enforcement (bypass-by-URL is this repo's historical bug class),
  cross-service payload shapes, data-loss paths (converters, migrations,
  delete guards), and product decisions (who can publish/edit what).
- NEVER write tests that mirror configuration back at itself: menu
  labels/orders, exact dashboard card lists, per-view repeats of the same
  permission gate, or Django/Wagtail framework mechanics (field validators,
  require_admin_access redirects). Those break on every UI rename and catch
  nothing.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

Track all tasks with **bd (beads)** — never TodoWrite/TaskCreate/markdown TODOs. The SessionStart hook injects the full command reference and session-close protocol (`bd prime`) into every session; follow that protocol when ending a session — work is complete only after `git push` succeeds. <!-- END BEADS INTEGRATION -->
