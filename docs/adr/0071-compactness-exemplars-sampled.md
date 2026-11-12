# 71. Compactness exemplars are a seeded sample of the 118th Congress districts

Date: 2026-11-12 (PR #843)

## Status

Accepted.

## Context

The evaluation panel explains a Polsby-Popper or Reock score by showing districts that have that score. It showed three hand-picked districts per score. Picking one district over another is a political statement, and nothing recorded why those were picked. The six were also scored on EPSG:5070, the projection [0063](0063-compactness-state-utm.md) replaced, and the two Alabama shapes were labelled 2021 although they came from the 2023 court-ordered plan.

## Decision

The exemplars are a random sample of every drawn district of the 118th Congress, the first maps drawn after the 2020 census and used in the 2022 election. A one-off generator produces them and nothing is picked by hand.

- **Source.** Census TIGER/Line 2022 congressional district files. They carry the Census Bureau's 2020 boundary shapes, the shapes Districtr's map units use, so a plan loaded into Districtr scores the same as its exemplar: for 24 districts in four states the two agree within 0.0001. Later releases reposition the same boundaries and score up to 0.003 differently.
- **Excluded.** States with one district, the delegate districts, and Hawaii, whose scores come from island geography (the 2nd district's Reock score is 0.005). 427 districts in 43 states remain.
- **Scores.** The formulas of `backend/app/evaluation/compactness.py`, in each state's zone from `STATE_UTM_EPSG`.
- **Ranges.** 0.05 wide over the whole 0-to-1 scale, assigned on the 3-decimal score the panel shows; empty ranges are not shown.
- **Sample.** At most 10 districts per range, drawn once with `random.Random(118)`. The seed is the Congress number, and the first sample it gave is the one that ships.

The generator writes `app/src/app/constants/compactnessExemplars.json` (ranges, sampled districts, simplified outlines as SVG paths) and `docs/compactness-exemplars/cd118_compactness_scores.csv` (both scores of all 427 districts; its README describes the columns). The panel opens each score on the range that holds the plan's own mean.

The generator runs once per change of policy, so it lives outside this repository: `data-mgmt/compactness-exemplars/` in the private `districtr/districtr-scratchpad` repo (commit 4898141), with its tests and a check that recomputes the CSV with gerrytools. It carries a copy of the two formulas and of `STATE_UTM_EPSG`.

## Alternatives considered

- The districts in force today (120th Congress, TIGER/Line 2026). They go out of date with every redraw, ten states between the 119th and 120th Congress, and their 2026 line work scores up to 0.003 differently from the same districts built from Districtr's units.
- Sampling in the browser on every visit. No fixed selection exists then, but two people looking at the same plan see different districts and a screenshot cannot be reproduced.

## Consequences

Some exemplars are maps that were later replaced or struck down; the panel names the Congress and the election year. Changing the source, the exclusions, the range width or the seed means re-running the generator, committing both outputs here, and running the gerrytools check. A change to the backend's formulas or UTM table has to be copied into the generator first. The sample depends on Python's `random.Random.sample` and the outlines on GEOS simplification, so a regenerated file can differ after a major upgrade of either; the committed files are the record.
