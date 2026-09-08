# 18. DistrictrMap slug decoupled from GerryDB table name

Date: 2025-03-17 (recorded retrospectively 2026-09-08)

## Status

Accepted

## Context

`DistrictrMap`'s human-readable slug was 1-1 coupled to its gerrydb table name, which prevented multiple maps from sharing the same underlying gerrydb table — a real, recurring need (PR #307, fixing #305).

## Decision

Add a unique `slug` column to `DistrictrMap`, independent of `gerrydb_table_name`, and drop the uniqueness constraint on `gerrydb_table_name`. Existing maps get their slug backpopulated from the prior gerrydb-table-name-derived value during migration.

## Consequences

Multiple `DistrictrMap` records can now point at the same gerrydb table (verified with two Alaska maps sharing underlying data). `Document` gains a foreign key onto the slug rather than the table name, and all UDFs and CLI commands that referenced the table name as an identifier were revised accordingly.
