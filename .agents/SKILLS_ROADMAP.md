# Skills Backlog

Recommended agent skills to develop, organized by priority. Each section includes links to existing skills/tools to evaluate as starting points or direct integrations.

## High Priority

### Quality Gate Runner
Run the full quality gate suite (pre-commit lint, FE build, BE tests) in one command. Report failures with actionable context.
- **Trigger**: Before any PR or session completion
- **Tools**: docker-compose, pytest, bun, ruff, prettier

**Recommended starting points:**
- [phrazzld/claude-config → quality-gates](https://claude-plugins.dev/skills/@phrazzld/claude-config/quality-gates) - Quality gate standards for git hooks, testing, CI/CD using Lefthook, Vitest, GitHub Actions
- [levnikolaevich/claude-code-skills → agile-workflow](https://github.com/levnikolaevich/claude-code-skills) - Full delivery lifecycle suite with task reviewer (ln-402), story quality gate (ln-500), and pipeline orchestrator (ln-1000)
- [ChrisWiles/claude-code-showcase](https://github.com/ChrisWiles/claude-code-showcase) - Reference project with hooks, skills, and GitHub Actions workflow examples

### Database Migration Author
Generate Alembic migrations from model changes, validate forward+backward compatibility, run downgrade tests. Enforce SQLAlchemy-first policy.
- **Trigger**: When models.py or schema changes are made
- **Tools**: alembic, sqlalchemy, pytest

**Recommended starting points:**
- [gastonsalg/claude-skills → safe-migration](https://github.com/gastonsalg/claude-skills) - Alembic migration safety review: checks for dangerous operations, conflicts, table locks, production deployment risk assessment
- [manutej/luxor-claude-marketplace → alembic](https://playbooks.com/skills/manutej/luxor-claude-marketplace/alembic) - Alembic-specific skill for migration workflows
- [microck/ordinary-claude-skills → backend-migration-standards](https://lobehub.com/skills/microck-ordinary-claude-skills-backend-migration-standards) - Backend migration standards and patterns

### Map Onboarding Workflow
End-to-end map setup: import GeoPackage → create GerryDB table → create DistrictrMap → generate tilesets → create shatter edges → link graph. Currently requires 5+ CLI commands.
- **Trigger**: When onboarding a new geographic layer
- **Tools**: backend CLI, pipelines CLI, S3/R2

**Recommended starting points (MCP servers for GIS validation):**
- [mahdin75/gis-mcp](https://github.com/mahdin75/gis-mcp) - MCP server connecting LLMs to GIS operations: geometry ops, coordinate transforms, spatial analysis, shapefile/geopackage reading
- [JordanGunn/gdal-mcp](https://github.com/Wayfinder-Foundry/gdal-mcp) - GDAL-style geospatial workflows via Rasterio, GeoPandas, PyProj with built-in reasoning guidance
- [matbel91765/GIS-MCP-Server](https://github.com/matbel91765/gis-mcp-server) - Read geospatial files (Shapefile, GeoJSON, GeoPackage), geocoding, routing, spatial analysis

### PR Review Assistant
Automated review checklist: expert guide compliance, quality gate results, migration safety, API contract consistency, security checklist.
- **Trigger**: When a PR is ready for review
- **Tools**: git diff, grep, docker-compose

**Recommended starting points:**
- [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) - **(Official)** GitHub Action for automated PR review with path-specific triggers, custom checklists, security-focused reviews, and progress tracking
- [anthropics/claude-code → code-review plugin](https://github.com/anthropics/claude-code/blob/main/plugins/code-review/README.md) - **(Official)** Built-in `/code-review` command that launches specialized review agents for logic errors, security, edge cases, regressions
- [SpillwaveSolutions/pr-reviewer-skill](https://github.com/SpillwaveSolutions/pr-reviewer-skill) - Comprehensive PR review: data collection via `gh` CLI, structured review files, inline comments, approval workflow
- [aidankinzett/claude-git-pr-skill](https://github.com/aidankinzett/claude-git-pr-skill) - GitHub PR review with pending reviews, code suggestions, and user approval workflow
- [anthropics/claude-code-security-review](https://github.com/anthropics/claude-code-security-review) - **(Official)** Security-focused review GitHub Action for analyzing code changes for vulnerabilities

## Medium Priority

### API Contract Auditor
Compare frontend TypeScript types (`apiHandlers/types.ts`) against backend Pydantic/SQLModel schemas. Detect drift and generate fix suggestions.
- **Trigger**: When API endpoints or types are modified
- **Tools**: grep, typescript, pydantic

**Recommended starting points:**
- [Jeffallan/claude-skills → fastapi-expert](https://github.com/Jeffallan/claude-skills) - FastAPI specialist with Pydantic V2, async SQLAlchemy, type-safe API patterns (66 skills across 12 categories)
- Custom skill recommended - no existing skill specifically handles TS↔Pydantic contract diffing

### Sync Conflict Debugger
Trace IDB vs server state divergence. Replay conflict scenarios and validate resolution paths.
- **Trigger**: When debugging save/load issues
- **Tools**: browser devtools, API calls, IDB inspection

**Recommended starting points:**
- [anthropics/skills → webapp-testing](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) - **(Official)** Web application testing skill using Playwright browser automation
- Custom skill recommended - this is domain-specific to the districtr sync architecture

### Beads Issue Manager
Parse work requirements from conversations, create structured issues, track progress, sync with git. Automate the `bd` workflow.
- **Trigger**: Session start/end, when work items are identified
- **Tools**: bd CLI, git

**Recommended starting points:**
- Custom skill recommended - beads is a niche tool with no existing integrations

### Docker Environment Doctor
Diagnose container startup failures, volume issues, migration errors, and connectivity problems. Suggest fixes.
- **Trigger**: When docker-compose commands fail
- **Tools**: docker-compose, docker logs, pg_isready

**Recommended starting points (MCP servers):**
- [ckreiling/mcp-server-docker](https://github.com/ckreiling/mcp-server-docker) - MCP server for Docker: compose with natural language, introspect/debug running containers, manage volumes
- [QuantGeekDev/docker-mcp](https://github.com/QuantGeekDev/docker-mcp) - Docker MCP for container creation, compose stack deployment, log retrieval, status monitoring
- [docker/mcp-gateway](https://github.com/docker/mcp-gateway) - **(Official Docker)** MCP gateway with container isolation, server management, secrets handling

## Lower Priority

### Performance Profiler
Identify slow database queries, worker bottlenecks, and render cycles. Generate flamegraphs and optimization suggestions.
- **Trigger**: When performance regressions are suspected
- **Tools**: pytest-benchmark, browser performance API, EXPLAIN ANALYZE

**Recommended starting points (MCP servers):**
- [crystaldba/postgres-mcp](https://github.com/crystaldba/postgres-mcp) - Postgres MCP Pro: EXPLAIN plan analysis, index tuning (greedy search via Microsoft's Anytime algorithm), health analysis (buffer cache, vacuum, replication lag), hypothetical index simulation via `hypopg`
- [sgaunat/postgresql-mcp](https://github.com/sgaunat/postgresql-mcp) - PostgreSQL MCP with schema exploration and performance analysis

### GIS Data Validator
Verify GeoPackage/Shapefile integrity, geometry topology, CRS consistency, and layer naming conventions before pipeline ingestion.
- **Trigger**: When new geographic data is introduced
- **Tools**: ogrinfo, GDAL, shapely

**Recommended starting points (MCP servers):**
- [mahdin75/gis-mcp](https://github.com/mahdin75/gis-mcp) - GIS MCP server: geometry operations, coordinate transformations, static map generation from shapefiles/rasters/GeoPackage
- [JordanGunn/gdal-mcp](https://github.com/Wayfinder-Foundry/gdal-mcp) - GDAL MCP with catalog discovery, metadata intelligence, raster/vector processing, and methodological reasoning middleware

### Export Format Tester
Validate GeoJSON, Shapefile, and CSV exports against schema expectations. Test round-trip data integrity.
- **Trigger**: When export endpoints are modified
- **Tools**: pytest, ogr2ogr, file comparison

**Recommended starting points:**
- Custom skill recommended - combine GIS MCP servers above with pytest patterns

### Dependency Auditor
Track package upgrades, deprecations, and security vulnerabilities across Python (uv) and JS (bun) dependencies.
- **Trigger**: Periodic or when dependency issues arise
- **Tools**: uv, bun, npm audit, pip-audit

**Recommended starting points:**
- [alirezarezvani/claude-skills → dependency-auditor](https://github.com/alirezarezvani/claude-skills) - Supports npm/yarn/pnpm, pip/pipenv/poetry, bundler, Maven/Gradle, Go modules, Composer
- [wrsmith108/claude-skill-security-auditor](https://github.com/wrsmith108/claude-skill-security-auditor) - Security audit with transitive dependency analysis, copy-paste remediation commands, accepted risk tracking
- [trailofbits/skills](https://github.com/trailofbits/skills) - Trail of Bits security research skills for vulnerability detection and audit workflows
- [makr.io → dependency-audit](https://www.makr.io/skills/dependency-audit) - Update, clean up, and secure dependencies

---

## Reference: Skill Catalogs

Curated lists for discovering additional skills:
- [anthropics/skills](https://github.com/anthropics/skills) - Official Anthropic skills repository
- [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) - Curated community skills list
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) - 500+ agent skills from official teams and community
- [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) - 135 agents, 35 skills, 42 commands, 150+ plugins
- [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) - Comprehensive MCP server directory
- [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) - Official MCP reference implementations
- [rohitg00/awesome-devops-mcp-servers](https://github.com/rohitg00/awesome-devops-mcp-servers) - DevOps-focused MCP servers
