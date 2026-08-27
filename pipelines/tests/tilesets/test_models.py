from tilesets.models import GerryDBTileset


def test_columns_survive_repeated_iteration():
    """Regression: with columns typed Iterable[str], pydantic v2 wrapped
    config-supplied values in a one-shot lazy iterable — generate_tiles drained
    it and generate_points silently saw no pop columns."""
    tileset = GerryDBTileset(
        gpkg="x.gpkg",
        layer_name="layer",
        new_layer_name=None,
        columns=iter(["path", "total_pop_20"]),
    )
    assert ",".join(tileset.columns) == "path,total_pop_20"
    # second pass — the one that used to come back empty
    assert [c for c in tileset.columns if "pop" in c.lower()] == ["total_pop_20"]
