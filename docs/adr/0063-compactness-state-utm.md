# 63. Compactness projects each state to its GerryChain UTM zone

Date: 2026-10-15 (PR #802; recorded retrospectively 2026-10-23)

## Status

Accepted.

## Context

Polsby-Popper and Reock projected every district, in every state, to EPSG:5070 (CONUS Albers) before measuring area and perimeter. That projection is equal-area, so it distorts shape, which is what both scores measure, and it is defined only for the lower 48. Measured against area and perimeter computed on the GRS80 ellipsoid, using all ~3,200 counties as district-sized shapes, 5070 was off by up to 0.0065 Polsby-Popper in the lower 48, 0.11 (−27%) in Alaska and 0.023 in Puerto Rico; Reock was worse, up to 0.17 in Alaska (PR #802). Districtr's scores are also read next to expert reports built on GerryChain, which reprojects to UTM.

## Decision

Compactness metrics project to one WGS 84 / UTM zone per state (`EPSG:326xx`), hard-coded in `STATE_UTM_EPSG` (`backend/app/evaluation/context.py`) and keyed by `DistrictrMap.statefps`. Each state's zone is the most common zone among its VTD centroids, the rule GerryChain's `reprojected()` uses, so Districtr's numbers line up with GerryChain-based work (Florida comes out as 17N, the zone used in Florida litigation). A map spanning several states, such as Navajo Nation (AZ/NM/UT), uses its first state's zone. A map with no `statefps`, or a FIPS missing from the table, fails the two compactness metrics with a `ValueError` through the per-metric failure path; there is no fallback to 5070. `polsby_popper` and `reock` move to version 2 in the metric registry, so stored evaluations recompute ([0034](0034-evaluation-metrics-json-payload.md)).

## Alternatives considered

- State Plane zones. Agree with UTM to within about 1e-4 Polsby-Popper, so the extra zones and their multi-zone states buy nothing.
- Choosing each state's zone by area or population majority instead of VTD centroids. Differs from the GerryChain rule in AK, GA, HI, MI, VA (area) and KS (population); every candidate zone is within ~0.0016 Polsby-Popper of the ellipsoid, so matching GerryChain was preferred over that small gain (confirmed with Moon Duchin, 2026-10-12).
- A projection per district, or geodesic area and perimeter. More exact, but no longer comparable to GerryChain output.

## Consequences

Compactness error against the ellipsoid drops to 0.0001 Polsby-Popper at the 99th percentile and 0.0006 Reock at worst, including Alaska and Puerto Rico. `statefps` becomes required data for any map that is evaluated, where it was previously needed mainly for Navajo Nation ([0037](0037-county-demographics-cache.md)); onboarding a new state or territory means adding its zone to `STATE_UTM_EPSG` by the same VTD-centroid rule. The reference scores in `app/src/app/components/EvalPanel/CompactnessSection.tsx` are still 5070 values (a shift of a few thousandths in the lower 48) until they are recomputed.

## Revisit when

GerryChain changes its reprojection rule, or Districtr's scores no longer need to match GerryChain-based reports.
