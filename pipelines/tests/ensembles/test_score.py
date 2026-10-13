import json
import math

import geopandas as gpd
import numpy as np
from shapely.geometry import box

from ensembles import score


def _write_vtd_gpkg(path, paths, geometries, **columns):
    gdf = gpd.GeoDataFrame(
        {"path": paths, **columns, "geometry": geometries}, crs="EPSG:5070"
    )
    gdf.to_file(path, layer=path.stem, driver="GPKG")


def _write_npz(path, node_ids, assignments):
    np.savez(
        path,
        node_ids=np.array(node_ids),
        assignments=np.array(assignments, dtype=np.uint8),
    )


def test_score_ensemble_polsby_popper_and_reock_of_unit_squares(tmp_path):
    # Four separated unit squares, each its own district: both scores have a
    # closed form for a square, independent of the squares' position.
    paths = ["vtd:00001000", "vtd:00001001", "vtd:00001002", "vtd:00001003"]
    squares = [box(0, 0, 1, 1), box(2, 0, 3, 1), box(4, 0, 5, 1), box(6, 0, 7, 1)]
    gpkg = tmp_path / "vtd.gpkg"
    _write_vtd_gpkg(gpkg, paths, squares)
    npz = tmp_path / "ensemble.npz"
    _write_npz(npz, paths, [[0, 1, 2, 3]])

    facts = score.score_ensemble(npz, gpkg, n_plans=None)

    assert facts["n_plans"] == 1
    np.testing.assert_allclose(
        facts["arrays"]["polsby_popper"][0], math.pi / 4, rtol=1e-9
    )
    np.testing.assert_allclose(facts["arrays"]["reock"][0], 2 / math.pi, rtol=1e-6)
    assert facts["arrays"]["polsby_popper"].shape == (1, 4)
    assert facts["arrays"]["reock"].shape == (1, 4)


def test_score_ensemble_county_splits_and_pieces_on_a_crossed_grid(tmp_path):
    # A 2x2 grid where the district boundary (left/right column) and the county
    # boundary (top/bottom row) cross: every county touches both districts.
    paths = ["vtd:00001000", "vtd:00001001", "vtd:00002000", "vtd:00002001"]
    cells = [box(0, 0, 1, 1), box(1, 0, 2, 1), box(0, 1, 1, 2), box(1, 1, 2, 2)]
    gpkg = tmp_path / "vtd.gpkg"
    _write_vtd_gpkg(gpkg, paths, cells)
    npz = tmp_path / "ensemble.npz"
    # left column (x: 0-1) -> district 0, right column (x: 1-2) -> district 1.
    _write_npz(npz, paths, [[0, 1, 0, 1]])

    facts = score.score_ensemble(npz, gpkg, n_plans=None)

    assert (
        facts["arrays"]["county_splits"][0] == 2
    )  # both counties touch both districts
    assert facts["arrays"]["county_pieces"][0] == 4  # 2 districts in each of 2 counties
    assert facts["arrays"]["county_splits"].shape == (1,)
    assert facts["arrays"]["county_pieces"].shape == (1,)


def test_score_ensemble_county_pieces_counts_one_for_an_unsplit_county(tmp_path):
    # Same grid, but the district boundary now follows the county boundary
    # (top/bottom row): no county is split.
    paths = ["vtd:00001000", "vtd:00001001", "vtd:00002000", "vtd:00002001"]
    cells = [box(0, 0, 1, 1), box(1, 0, 2, 1), box(0, 1, 1, 2), box(1, 1, 2, 2)]
    gpkg = tmp_path / "vtd.gpkg"
    _write_vtd_gpkg(gpkg, paths, cells)
    npz = tmp_path / "ensemble.npz"
    # bottom row (00001) -> district 0, top row (00002) -> district 1.
    _write_npz(npz, paths, [[0, 0, 1, 1]])

    facts = score.score_ensemble(npz, gpkg, n_plans=None)

    assert facts["arrays"]["county_splits"][0] == 0
    assert facts["arrays"]["county_pieces"][0] == 2


def test_score_ensemble_n_plans_truncates_to_the_first_n(tmp_path):
    paths = ["vtd:00001000", "vtd:00001001", "vtd:00002000", "vtd:00002001"]
    cells = [box(0, 0, 1, 1), box(1, 0, 2, 1), box(0, 1, 1, 2), box(1, 1, 2, 2)]
    gpkg = tmp_path / "vtd.gpkg"
    _write_vtd_gpkg(gpkg, paths, cells)
    npz = tmp_path / "ensemble.npz"
    _write_npz(npz, paths, [[0, 0, 1, 1]] * 5)

    facts = score.score_ensemble(npz, gpkg, n_plans=2)

    assert facts["n_plans"] == 2
    assert facts["arrays"]["reock"].shape[0] == 2
    assert facts["arrays"]["county_splits"].shape == (2,)


def test_score_ensemble_partisan_and_competitiveness_series(tmp_path):
    # Two districts of two VTDs: district 0 votes 60/40 Democratic, district 1
    # 30/70; statewide the Democratic two-party share is 180/400 = 0.45.
    paths = ["vtd:00001000", "vtd:00001001", "vtd:00002000", "vtd:00002001"]
    cells = [box(0, 0, 1, 1), box(1, 0, 2, 1), box(0, 1, 1, 2), box(1, 1, 2, 2)]
    gpkg = tmp_path / "vtd.gpkg"
    _write_vtd_gpkg(
        gpkg,
        paths,
        cells,
        total_pop_20=[100, 100, 100, 100],
        pres_24_dem=[60, 60, 30, 30],
        pres_24_rep=[40, 40, 70, 70],
    )
    npz = tmp_path / "ensemble.npz"
    _write_npz(npz, paths, [[0, 0, 1, 1]])

    facts = score.score_ensemble(npz, gpkg, n_plans=None)
    arrays = facts["arrays"]

    assert facts["elections"] == ["pres_24"]
    assert arrays["seats__pres_24"][0] == 1
    assert arrays["rep_seats__pres_24"][0] == 1
    np.testing.assert_allclose(arrays["district_vote_shares__pres_24"][0], [0.6, 0.3])
    np.testing.assert_allclose(arrays["disproportionality__pres_24"][0], 0.5 - 0.45)
    assert arrays["n_dem_districts"][0] == 1
    assert arrays["n_rep_districts"][0] == 1
    assert arrays["n_swing_districts"][0] == 0
    assert arrays["n_competitive_contests"][0] == 0
    for metric in ("efficiency_gap", "mean_median", "partisan_bias", "eguia"):
        assert arrays[f"{metric}__pres_24"].shape == (1,)


def test_score_ensemble_derives_compactness_aggregates(tmp_path):
    paths = ["vtd:00001000", "vtd:00001001", "vtd:00001002"]
    shapes = [box(0, 0, 1, 1), box(2, 0, 4, 1), box(5, 0, 6, 1)]
    gpkg = tmp_path / "vtd.gpkg"
    _write_vtd_gpkg(gpkg, paths, shapes)
    npz = tmp_path / "ensemble.npz"
    _write_npz(npz, paths, [[0, 1, 2]])

    arrays = score.score_ensemble(npz, gpkg, n_plans=None)["arrays"]

    for metric in ("polsby_popper", "reock"):
        per_district = arrays[metric][0]
        np.testing.assert_allclose(arrays[f"{metric}_mean"][0], per_district.mean())
        np.testing.assert_allclose(arrays[f"{metric}_min"][0], per_district.min())
        np.testing.assert_allclose(arrays[f"{metric}_max"][0], per_district.max())


def test_write_npz_and_manifest_round_trip(tmp_path):
    facts = {
        "arrays": {
            "reock": np.array([[0.5, 0.6]]),
            "polsby_popper": np.array([[0.7, 0.8]]),
            "county_splits": np.array([1]),
            "county_pieces": np.array([3]),
            "seats__pres_24": np.array([1]),
        },
        "elections": ["pres_24"],
        "n_plans": 1,
        "num_dists": 2,
        "wall_time_seconds": 0.01,
    }
    out_npz = tmp_path / "recom_b.scores.npz"
    score.write_npz(out_npz, facts)
    score.write_manifest(out_npz.with_suffix(".json"), "recom_b.npz", "vtd.gpkg", facts)

    loaded = np.load(out_npz)
    np.testing.assert_array_equal(loaded["reock"], facts["arrays"]["reock"])
    np.testing.assert_array_equal(loaded["seats__pres_24"], [1])
    assert loaded["elections"].tolist() == ["pres_24"]
    assert int(loaded["n_plans"]) == 1

    manifest = json.loads(out_npz.with_suffix(".json").read_text())
    assert manifest["gerrytools_version"]
    assert manifest["elections"] == ["pres_24"]
    assert "county_splits" in manifest["definitions"]
