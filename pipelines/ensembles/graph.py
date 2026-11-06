"""Build the chain input: a VTD dual graph with integer tallies and a seed plan.

rustrecom reads NetworkX ``adjacency_data`` JSON. Every tally column must be
integer-valued and present on every node; the seed column must hold
consecutive district labels. Adjacency comes from the GerryDB edge layer of
the VTD GeoPackage, the same source the app's contiguity graph is built from.
"""

import collections
import json
import logging
import sqlite3
from pathlib import Path

import geopandas as gpd
import networkx as nx
import pandas as pd
from networkx.readwrite import json_graph

from transforms.graph import _gpkg_layer_name, _safe_ident

logger = logging.getLogger(__name__)

POP_COL = "total_pop_20"
COUNTY_COL = "county"
COUSUB_COL = "cousub"
CORE_COL = "core"
SEED_COL = "seed"
EDGE_LAYER = "gerrydb_graph_edge"


def election_columns(columns) -> list[str]:
    return [c for c in columns if c.endswith(("_dem", "_rep"))]


def county_of(path: str) -> str:
    """Five-character county GEOID from a GerryDB path such as ``vtd:08001001001``."""
    return path.split(":")[-1][:5]


def load_vtd_graph(vtd_gpkg: str | Path, layer: str | None = None) -> nx.Graph:
    """VTD graph with population, election tallies and county on every node."""
    layer = layer or _gpkg_layer_name(vtd_gpkg)
    conn = sqlite3.connect(vtd_gpkg)
    edges = conn.execute(
        f"SELECT path_1, path_2 FROM {_safe_ident(EDGE_LAYER)}"
    ).fetchall()
    conn.close()
    graph = nx.Graph(edges)

    table = gpd.read_file(vtd_gpkg, layer=layer, ignore_geometry=True).set_index("path")
    missing = set(graph.nodes) ^ set(table.index)
    if missing:
        raise ValueError(f"Edge layer and table disagree on {len(missing)} paths")
    cols = [POP_COL, *election_columns(table.columns)]
    values = table[cols]
    if ((values - values.round()).abs() > 0).any().any():
        raise ValueError("Tally columns must be integer-valued")
    values = values.round().astype(int)
    for path, row in values.iterrows():
        graph.nodes[path].update(row.to_dict())
        graph.nodes[path][COUNTY_COL] = county_of(path)
    logger.info(
        "Loaded %d VTDs, %d edges, %d tally columns",
        graph.number_of_nodes(),
        graph.number_of_edges(),
        len(cols),
    )
    return graph


def block_vtd_table(vtd_gpkg: str | Path, block_gpkg: str | Path) -> pd.DataFrame:
    """Every block with its population and the VTD holding its representative
    point, the same predicate the combined graph build uses. Columns: ``path``
    (block GEOID), ``vtd``, the population column."""
    blocks = gpd.read_file(block_gpkg, layer=_gpkg_layer_name(block_gpkg))[
        ["path", POP_COL, "geometry"]
    ]
    vtds = gpd.read_file(vtd_gpkg, layer=_gpkg_layer_name(vtd_gpkg))[
        ["path", "geometry"]
    ].rename(columns={"path": "vtd"})
    if blocks.crs != vtds.crs:
        blocks = blocks.to_crs(vtds.crs)
    points = blocks.set_geometry(blocks.geometry.representative_point())
    joined = gpd.sjoin(points, vtds, how="inner", predicate="within")
    unmatched = len(blocks) - len(joined)
    if unmatched:
        logger.warning("%d blocks fall in no VTD", unmatched)
    return pd.DataFrame(joined[["path", "vtd", POP_COL]])


def majority_by_vtd(
    graph: nx.Graph, block_vtd: pd.DataFrame, values: pd.Series, what: str
) -> dict[str, str]:
    """Each VTD takes the value (district, subdivision) holding most of its
    population among its blocks. ``values`` is indexed by block GEOID."""
    merged = block_vtd.merge(
        values.rename("value"), left_on="path", right_index=True, how="inner"
    )
    unmatched = len(block_vtd) - len(merged)
    if unmatched:
        logger.warning("%d blocks have no %s", unmatched, what)
    by_vtd = (
        merged.groupby(["vtd", "value"])[POP_COL]
        .sum()
        .reset_index()
        .sort_values(POP_COL, ascending=False)
        .drop_duplicates("vtd")
        .set_index("vtd")["value"]
    )
    missing = set(graph.nodes) - set(by_vtd.index)
    if missing:
        raise ValueError(f"{len(missing)} VTDs received no {what}")
    return {n: str(by_vtd[n]) for n in graph.nodes}


def plan_from_block_csv(
    csv_path: str | Path, geoid_col: str = "GEOID20", district_col: str = "District"
) -> pd.Series:
    """District of every block from a plan CSV, indexed by block GEOID."""
    plan = pd.read_csv(csv_path, dtype={geoid_col: str, district_col: int})
    return plan.set_index(geoid_col)[district_col]


def seed_from_block_csv(
    graph: nx.Graph,
    block_vtd: pd.DataFrame,
    csv_path: str | Path,
) -> dict[str, int]:
    """VTD-level seed from a block-level plan: each VTD takes the district holding
    most of its population."""
    by_vtd = majority_by_vtd(
        graph, block_vtd, plan_from_block_csv(csv_path), "district"
    )
    return {n: int(v) for n, v in by_vtd.items()}


# 2020 PL 94-171 geoheader: pipe-delimited, no header row. Block records carry
# summary level 750; the block GEOID is the GEOCODE field and the county
# subdivision code is the COUSUB field, which nests only within its county.
PL_SUMLEV, PL_GEOCODE, PL_STATE, PL_COUNTY, PL_COUSUB = 2, 9, 12, 14, 17


def cousub_from_pl_geo(geo_path: str | Path) -> pd.Series:
    """County subdivision (state + county + COUSUB, ten characters) of every
    block, from the state's PL 94-171 geoheader file."""
    geoids, cousubs = [], []
    with open(geo_path, encoding="latin-1") as f:
        for line in f:
            fields = line.rstrip("\n").split("|")
            if fields[PL_SUMLEV] != "750":
                continue
            geoids.append(fields[PL_GEOCODE])
            cousubs.append(fields[PL_STATE] + fields[PL_COUNTY] + fields[PL_COUSUB])
    return pd.Series(cousubs, index=pd.Index(geoids, name="GEOID20"), name="cousub")


def repair_seed(graph: nx.Graph, seed: dict[str, int]) -> list[str]:
    """Make every seed district contiguous, in place; returns a log of the moves.

    A VTD-level seed derived from a block plan can leave a district in several
    pieces where the block plan splits VTDs. A large piece is reconnected by
    flipping one bridging VTD (a neighbour of both pieces) into the district;
    a piece of at most three VTDs is handed to the neighbouring district that
    shares the most boundary with it.
    """
    log: list[str] = []
    districts = sorted(set(seed.values()))

    def pieces(k):
        nodes = [n for n in graph if seed[n] == k]
        return sorted(nx.connected_components(graph.subgraph(nodes)), key=len)

    for _ in range(100):
        broken = [(k, p) for k in districts for p in pieces(k)[:-1]]
        if not broken:
            return log
        k, piece = max(broken, key=lambda kp: len(kp[1]))
        main = pieces(k)[-1]
        bridges = [
            v
            for v in graph
            if seed[v] != k
            and any(u in piece for u in graph[v])
            and any(u in main for u in graph[v])
        ]
        if bridges and len(piece) > 3:
            bridge = max(bridges, key=lambda v: graph.nodes[v][POP_COL])
            log.append(f"district {k}: flipped bridge {bridge} from {seed[bridge]}")
            seed[bridge] = k
        else:
            neighbours = collections.Counter(
                seed[u] for n in piece for u in graph[n] if seed[u] != k
            )
            if not neighbours:
                raise ValueError(
                    f"district {k}: piece {sorted(piece)} has no neighbours"
                )
            target = neighbours.most_common(1)[0][0]
            log.append(f"district {k}: moved {len(piece)} VTD(s) to {target}")
            for n in piece:
                seed[n] = target
    raise ValueError("Seed could not be made contiguous")


def write_graph_json(
    graph: nx.Graph, seed: dict[str, int], out_path: str | Path
) -> None:
    """Write the chain input with ``seed`` attached as the assignment column."""
    labels = sorted(set(seed.values()))
    if labels != list(range(labels[0], labels[0] + len(labels))):
        raise ValueError(f"Seed labels must be consecutive, got {labels}")
    nx.set_node_attributes(graph, seed, SEED_COL)
    with open(out_path, "w") as f:
        json.dump(json_graph.adjacency_data(graph), f)
