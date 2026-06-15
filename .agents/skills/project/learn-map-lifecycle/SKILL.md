---
name: learn-map-lifecycle
description: Map data lifecycle - imports, shatter setup, edges, graph linkage
user-invocable: false
---

# GerryDB Map Lifecycle

End-to-end lifecycle for loading geospatial source layers, creating Districtr map metadata, wiring shatter relationships, and enabling contiguity support.

## When To Use
- You are adding or modifying map/module onboarding workflows.
- You are changing CLI commands for gerrydb imports or map creation.
- You are debugging parent/child edge, shatter, or graph-based contiguity issues.

## Canonical Files
- `backend/cli.py`
- `backend/management/load_data.py`
- `backend/app/utils.py`
- `backend/app/main.py`
- `backend/app/contiguity/main.py`
- `backend/app/models.py`
- `backend/management/configs/*`

## Hard Invariants
- Lifecycle ordering matters:
  1. Import gerrydb layer(s)
  2. Create shatterable view (if applicable)
  3. Create districtr map record
  4. Create parent-child edges
  5. Generate/load contiguity graph
- Parent/child relationships require geometry nesting consistency.
- `districtr_map_slug`, layers, and tiles paths must remain consistent across FE/BE contracts.
- Contiguity endpoints depend on graph availability and correct layer selection.

## Preferred Patterns
- Use CLI commands for management operations instead of public API expansion.
- Keep map creation and edge creation explicit and auditable.
- Use batch config workflows for repeatable multi-map setup.
- Validate resulting map metadata by hitting `/api/gerrydb/views` and `/api/document/*` flows.

## Anti-Patterns
- Skipping edge generation for shatterable maps.
- Manual DB edits that bypass CLI/utility invariants.
- Mismatched parent/child/table names across map records and loaded layers.
- Treating graph generation as optional for contiguity-supported maps.

## Change Checklist
1. Verify import command and layer naming correctness.
2. Verify map row created with expected slug/layers/paths.
3. Verify parent-child edges exist for shatterable maps.
4. Verify graph generated and accessible for contiguity.
5. Verify frontend can load and edit resulting map module.

## Validation Commands
- `cd backend && python cli.py import-gerrydb-view --help`
- `cd backend && python cli.py create-districtr-map --help`
- `cd backend && python cli.py create-parent-child-edges --help`
- `cd backend && python cli.py batch-create-districtr-maps --help`

## See Also
- [learn-pipelines](../learn-pipelines/SKILL.md) - Data pipeline artifacts and contracts
- [learn-backend](../learn-backend/SKILL.md) - Backend integration points

## Common Failure Modes
- Graph unavailable errors during contiguity checks.
- Child/parent edge table empty due to layer mismatch.
- Invalid slug/layer wiring causing broken document creation.
- Large imports failing from missing external tooling or wrong data-dir assumptions.
