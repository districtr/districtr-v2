# 66. Ensemble plans as the evaluation panel's reference frame

Date: 2026-10-13 (PR #806)

## Status

Accepted.

## Context

The evaluation panel reported a plan's metrics with nothing to read them against: a 4% efficiency gap is unremarkable or extreme depending on what the map's geography allows, and the panel said nothing about which. Expert reports answer that question with an ensemble of computer-drawn plans for the same map, generated under the rules alone, and read the plan's value against the ensemble's distribution.

## Decision

Each metric cell carries the median of an ensemble of computer-drawn plans for the same module and the share of that ensemble the plan exceeds; a modal explains the plans and charts the full distribution.

- **The chain is rustrecom, not GerryChain.** `pipelines/ensembles` drives [frcw.rs](https://github.com/mggg/frcw.rs), the authors' Rust ReCom, at roughly 35 seconds for 100,000 accepted plans where the Python implementation takes hours. Two presets per module, ReCom-B and its county-aware variant, named for the Cannon, Duchin, Randall & Rule (2025) taxonomy. Each step of a non-reversible chain is an accepted plan, so there is no burn-in and no thinning.
- **Metrics come from gerrytools, not from the backend's formulas.** Scoring 100,000 plans needs its compiled engine (about 1 ms per plan), and gerrytools 2.0.1 pins newer pandas and geopandas than the rest of the pipelines, so the ensembles commands run from `requirements-ensembles.txt` in their own venv. Compactness is measured in the state's UTM zone, as [0063](0063-compactness-state-utm.md) decides for the backend.
- **Serving is a static package, so no backend endpoint exists.** Per module and preset, `ensembles/<module_slug>/` on the public bucket holds bucket counts, a 201-point quantile table, 100 example plans and their thumbnails. The browser computes the median and the plan's percentile from the quantile table; the plan's own values still come from the evaluation endpoint. The package is immutable per generation run and carries no environment segment, so one copy serves every deployment.
- **Adding a column to a module needs no new chain.** Assignments are stored, so new elections are tallied by re-scoring the stored plans.
- **The comparison is withheld rather than approximated.** A plan with unassigned units, or with a district count differing from the ensemble's, is measuring something the ensemble never drew, so the panel shows a disabled control and no numbers. The same reasoning withholds the cut-edges comparison on a shatterable module, where the backend counts block-level cut edges and the chain ran on VTDs.
- **Evaluation use only.** Offering a random ensemble plan as a starting point for editing is a separate decision, deliberately left unmade here.

## Consequences

Two implementations of each metric exist: the ensemble's values and the plan's own values are computed by different code, and a formula change on one side has to be mirrored on the other. A module gains the comparison only once a package has been generated and published for it; a module without a package shows the panel as before.
