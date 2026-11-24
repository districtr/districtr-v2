# Compactness exemplar scores

`cd118_compactness_scores.csv` lists the Polsby-Popper and Reock score of each of the 417 districts that the evaluation panel's example districts are sampled from: the drawn districts of the 118th Congress, used in the 2022 election, that are in one piece. [ADR 0071](../adr/0071-compactness-exemplars-sampled.md) records why this set was chosen.

## Use

- **Reference for the compactness code.** The scores use the backend's formulas and projection, on outlines that carry the same 2020 Census shapes as Districtr's map units. A 118th Congress plan loaded into Districtr should score within 0.0001 of its rows here; this was checked for Colorado, Massachusetts and Oklahoma. A larger difference after a change to `backend/app/evaluation/compactness.py` or to the projection points at that change.
- **Record behind the sample.** `app/src/app/constants/compactnessExemplars.json` holds only the sampled districts. Its score ranges and its sample come from this file: each score is rounded to 3 decimals and placed in one of six ranges 0.1 wide (0.05 to 0.65), a range including its lower edge and excluding its upper edge, and at most 18 districts per range are drawn with seed 118.

The app does not read this file.

## Columns

| Column | Meaning |
|---|---|
| `statefp` | Two-digit state FIPS code. Read it as text to keep the leading zero. |
| `district` | Congressional district number within the state. |
| `utm_epsg` | EPSG code of the WGS 84 / UTM zone the district was projected to before scoring: the state's entry in `STATE_UTM_EPSG` (`backend/app/evaluation/context.py`). |
| `polsby_popper` | 4π × area ÷ perimeter², at full precision. |
| `reock` | Area ÷ area of the smallest enclosing circle, at full precision. |

`compactnessExemplars.json` names a district by `statefp` followed by the two-digit district number: `0611` is California's 11th.

## Source

Census TIGER/Line 2022 congressional district files (`tl_2022_<statefp>_cd118.zip`). States with one district, the delegate districts, Hawaii and the 10 districts whose outline is in more than one piece are left out: AL-5, CA-11, CA-24, CA-42, CT-2, FL-28, KY-1, NY-10, RI-2 and TN-2.

## Outlines

An outline in `compactnessExemplars.json` is the district in its UTM zone, simplified with a tolerance of 1/400 of its longer side, scaled so that the longer side spans 1,000 units, with north up and every point rounded to a whole unit. Each ring of the SVG path starts at an absolute point and goes on in relative steps; a hole is a ring of its own, drawn with the even-odd fill rule.

## Regenerating

The generator, its tests and a cross-check against gerrytools are in the private `districtr/districtr-scratchpad` repo, under `data-mgmt/compactness-exemplars/`. The generator writes both this file and `compactnessExemplars.json`.
