import math

import geopandas as gpd
import numpy as np
from shapely.geometry import box

from ensembles import score


def _write_vtd_gpkg(path, paths, geometries):
    gdf = gpd.GeoDataFrame({"path": paths, "geometry": geometries}, crs="EPSG:5070")
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
    np.testing.assert_allclose(facts["polsby_popper"][0], math.pi / 4, rtol=1e-9)
    np.testing.assert_allclose(facts["reock"][0], 2 / math.pi, rtol=1e-6)
    assert facts["polsby_popper"].shape == (1, 4)
    assert facts["reock"].shape == (1, 4)


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

    assert facts["county_splits"][0] == 2  # both counties touch both districts
    assert facts["county_pieces"][0] == 4  # 2 districts in each of 2 counties
    assert facts["county_splits"].shape == (1,)
    assert facts["county_pieces"].shape == (1,)


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

    assert facts["county_splits"][0] == 0
    assert facts["county_pieces"][0] == 2


def test_score_ensemble_n_plans_truncates_to_the_first_n(tmp_path):
    paths = ["vtd:00001000", "vtd:00001001", "vtd:00002000", "vtd:00002001"]
    cells = [box(0, 0, 1, 1), box(1, 0, 2, 1), box(0, 1, 1, 2), box(1, 1, 2, 2)]
    gpkg = tmp_path / "vtd.gpkg"
    _write_vtd_gpkg(gpkg, paths, cells)
    npz = tmp_path / "ensemble.npz"
    _write_npz(npz, paths, [[0, 0, 1, 1]] * 5)

    facts = score.score_ensemble(npz, gpkg, n_plans=2)

    assert facts["n_plans"] == 2
    assert facts["reock"].shape[0] == 2
    assert facts["county_splits"].shape == (2,)


def test_write_npz_and_manifest_round_trip(tmp_path):
    facts = {
        "reock": np.array([[0.5, 0.6]]),
        "polsby_popper": np.array([[0.7, 0.8]]),
        "county_splits": np.array([1]),
        "county_pieces": np.array([3]),
        "n_plans": 1,
        "wall_time_seconds": 0.01,
    }
    out_npz = tmp_path / "recom_b.scores.npz"
    score.write_npz(out_npz, facts)
    score.write_manifest(out_npz.with_suffix(".json"), "recom_b.npz", "vtd.gpkg", facts)

    loaded = np.load(out_npz)
    np.testing.assert_array_equal(loaded["reock"], facts["reock"])
    np.testing.assert_array_equal(loaded["county_pieces"], facts["county_pieces"])
    assert int(loaded["n_plans"]) == 1

    manifest = out_npz.with_suffix(".json").read_text()
    assert "gerrytools_version" in manifest
    assert "county_splits" in manifest
