# Skills Backlog

Recommended agent skills to develop, organized by priority.

## High Priority

### Quality Gate Runner
Run the full quality gate suite (pre-commit lint, FE build, BE tests) in one command. Report failures with actionable context.
- **Trigger**: Before any PR or session completion
- **Tools**: docker-compose, pytest, bun, ruff, prettier

### Database Migration Author
Generate Alembic migrations from model changes, validate forward+backward compatibility, run downgrade tests. Enforce SQLAlchemy-first policy.
- **Trigger**: When models.py or schema changes are made
- **Tools**: alembic, sqlalchemy, pytest

### Map Onboarding Workflow
End-to-end map setup: import GeoPackage → create GerryDB table → create DistrictrMap → generate tilesets → create shatter edges → link graph. Currently requires 5+ CLI commands.
- **Trigger**: When onboarding a new geographic layer
- **Tools**: backend CLI, pipelines CLI, S3/R2

### PR Review Assistant
Automated review checklist: expert guide compliance, quality gate results, migration safety, API contract consistency, security checklist.
- **Trigger**: When a PR is ready for review
- **Tools**: git diff, grep, docker-compose

## Medium Priority

### API Contract Auditor
Compare frontend TypeScript types (`apiHandlers/types.ts`) against backend Pydantic/SQLModel schemas. Detect drift and generate fix suggestions.
- **Trigger**: When API endpoints or types are modified
- **Tools**: grep, typescript, pydantic

### Sync Conflict Debugger
Trace IDB vs server state divergence. Replay conflict scenarios and validate resolution paths.
- **Trigger**: When debugging save/load issues
- **Tools**: browser devtools, API calls, IDB inspection

### Beads Issue Manager
Parse work requirements from conversations, create structured issues, track progress, sync with git. Automate the `bd` workflow.
- **Trigger**: Session start/end, when work items are identified
- **Tools**: bd CLI, git

### Docker Environment Doctor
Diagnose container startup failures, volume issues, migration errors, and connectivity problems. Suggest fixes.
- **Trigger**: When docker-compose commands fail
- **Tools**: docker-compose, docker logs, pg_isready

## Lower Priority

### Performance Profiler
Identify slow database queries, worker bottlenecks, and render cycles. Generate flamegraphs and optimization suggestions.
- **Trigger**: When performance regressions are suspected
- **Tools**: pytest-benchmark, browser performance API, EXPLAIN ANALYZE

### GIS Data Validator
Verify GeoPackage/Shapefile integrity, geometry topology, CRS consistency, and layer naming conventions before pipeline ingestion.
- **Trigger**: When new geographic data is introduced
- **Tools**: ogrinfo, GDAL, shapely

### Export Format Tester
Validate GeoJSON, Shapefile, and CSV exports against schema expectations. Test round-trip data integrity.
- **Trigger**: When export endpoints are modified
- **Tools**: pytest, ogr2ogr, file comparison

### Dependency Auditor
Track package upgrades, deprecations, and security vulnerabilities across Python (uv) and JS (bun) dependencies.
- **Trigger**: Periodic or when dependency issues arise
- **Tools**: uv, bun, npm audit, pip-audit
