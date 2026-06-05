"""Graph building pipeline - produces dual-level pkl graphs without DB access.

Derives parent-child relationships from GeoPackage spatial joins.
"""

import logging
import os
import pickle
import re
import sqlite3
from enum import Enum
from pathlib import Path
from urllib.parse import urlparse

import geopandas as gpd
import pandas as pd
from networkx import Graph, number_connected_components
from pydantic import BaseModel

from core.io import download_file_from_s3
from core.models import Config
from core.settings import settings

LOGGER = logging.getLogger(__name__)

_S3_GRAPH_PREFIX = "graphs"
_SAFE_IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _safe_ident(name: str) -> str:
    if not _SAFE_IDENT_RE.match(name):
        raise ValueError(f"Unsafe SQL identifier: {name!r}")
    return name


def _resolve_path(path: str | Path) -> Path:
    """Download from S3 if needed and return a local path."""
    url = urlparse(str(path))
    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        return Path(download_file_from_s3(s3=s3, url=url, replace=False))
    return Path(path)


class GraphFileFormat(str, Enum):
    pkl = "Pickle"

    def format_filepath(self, filepath: str | Path) -> Path:
        return Path(f"{filepath}.pkl")

    def write_graph(self, G: Graph, filepath: str | Path) -> Path:
        out_path = self.format_filepath(filepath)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "wb") as f:
            pickle.dump(obj=G, file=f)
        return out_path


def graph_from_gpkg(
    gpkg_path: str | Path, layer_name: str = "gerrydb_graph_edge"
) -> Graph:
    """Load a block adjacency graph from a GeoPackage edge layer."""
    local_path = _resolve_path(gpkg_path)
    conn = sqlite3.connect(local_path)
    cursor = conn.execute(f"SELECT path_1, path_2 FROM {_safe_ident(layer_name)}")
    edgelist = cursor.fetchall()
    conn.close()
    LOGGER.info("Loaded %d edges from %s", len(edgelist), local_path)
    return Graph(edgelist)


def _gpkg_layer_name(gpkg_path: str | Path) -> str:
    """Derive the GerryDB layer name from the gpkg path.

    Convention (enforced by ogr2ogr import): layer name == gpkg filename stem.
    Works for both local paths and s3:// URIs.
    """
    url = urlparse(str(gpkg_path))
    return Path(url.path).stem


def _annotate_graph_with_parents_from_gpkg(
    G: Graph,
    child_gpkg: str | Path,
    parent_gpkg: str | Path,
    child_layer_name: str | None = None,
    parent_layer_name: str | None = None,
) -> None:
    """Attach parent node attributes to block nodes via GeoPackage spatial join.

    Replaces the parentchildedges DB query in the backend. Uses representative_point
    + within predicate, matching the PostGIS ST_PointOnSurface/ST_Contains procedure.
    Layer names default to the gpkg filename stem (GerryDB convention).
    Mutates G in place.
    """
    child_local = _resolve_path(child_gpkg)
    parent_local = _resolve_path(parent_gpkg)

    child_layer = child_layer_name or _gpkg_layer_name(child_gpkg)
    parent_layer = parent_layer_name or _gpkg_layer_name(parent_gpkg)

    child_gdf = gpd.read_file(child_local, layer=child_layer)[["path", "geometry"]]
    child_gdf = child_gdf[child_gdf["path"].isin(G.nodes)]

    parent_gdf = gpd.read_file(parent_local, layer=parent_layer)[
        ["path", "geometry"]
    ].rename(columns={"path": "parent_path"})

    if child_gdf.crs != parent_gdf.crs:
        child_gdf = child_gdf.to_crs(parent_gdf.crs)

    child_points = child_gdf.copy().set_geometry(
        child_gdf.geometry.representative_point()
    )

    joined = gpd.sjoin(
        child_points[["path", "geometry"]],
        parent_gdf[["parent_path", "geometry"]],
        how="left",
        predicate="within",
    )

    parent_map = joined.set_index("path")["parent_path"].to_dict()
    matched = 0
    for child_path, parent_path in parent_map.items():
        if pd.notna(parent_path):
            G.nodes[child_path]["parent"] = parent_path
            matched += 1

    LOGGER.info(
        "Annotated %d/%d block nodes with parents via spatial join",
        matched,
        len(G.nodes),
    )


def _build_combined_graph(G: Graph) -> None:
    """Extend an annotated block graph (child level) in-place into a dual-level combined graph.

    Node attributes:
        child nodes — ``parent``: path of the owning parent unit (pre-existing)
        parent nodes — ``children``: set of child node paths (added here)

    Edge structure (for each original block-block edge u–v):
        - u–v is kept (direct block adjacency)
        - if parent(u) != parent(v):
            - u–parent(v) and v–parent(u) are added (cross-level boundary edges)

    An edge represents adjacency, not containment; parent-child relations do not produce
    edges in this graph.

    Graph attributes:
        ``weighted_edges``: dict mapping canonical (min, max) parent-unit pairs to the
        number of block-level edges that cross that boundary.
        ``non_contiguous_parents``: set of parent-unit paths whose child blocks form
        more than one connected component (e.g. island precincts). These are expanded
        to their block children during contiguity evaluation so that geographic
        disconnection is not hidden by the single-node representation.
    """
    G.graph["weighted_edges"] = {}

    for u, v in list(G.edges()):
        p_u = G.nodes[u]["parent"]
        p_v = G.nodes[v]["parent"]
        if p_u != p_v:
            G.add_edge(u, p_v)
            G.add_edge(v, p_u)
            key = (p_u, p_v) if p_u < p_v else (p_v, p_u)
            G.graph["weighted_edges"][key] = G.graph["weighted_edges"].get(key, 0) + 1

    for p_u, p_v in G.graph["weighted_edges"]:
        G.add_edge(p_u, p_v)

    for node, data in list(G.nodes(data=True)):
        parent = data.get("parent")
        if parent:
            G.nodes[parent].setdefault("children", set()).add(node)

    non_contiguous = set()
    for node, data in G.nodes(data=True):
        children = data.get("children")
        if children and number_connected_components(G.subgraph(children)) > 1:
            non_contiguous.add(node)
    G.graph["non_contiguous_parents"] = non_contiguous

    LOGGER.info(
        "Built combined graph: %d nodes, %d edges, %d parent boundaries, "
        "%d non-contiguous parents",
        G.number_of_nodes(),
        G.number_of_edges(),
        len(G.graph["weighted_edges"]),
        len(non_contiguous),
    )


def build_combined_graph_from_gpkg(
    child_gpkg: str | Path,
    parent_gpkg: str | Path,
    child_layer_name: str | None = None,
    parent_layer_name: str | None = None,
    graph_edge_layer: str = "gerrydb_graph_edge",
) -> Graph:
    """Build a dual-level combined graph from GeoPackage files without DB access.

    Chains graph_from_gpkg → annotate (spatial join) → build_combined_graph.
    """
    G = graph_from_gpkg(child_gpkg, layer_name=graph_edge_layer)
    _annotate_graph_with_parents_from_gpkg(
        G, child_gpkg, parent_gpkg, child_layer_name, parent_layer_name
    )
    _build_combined_graph(G)
    return G


def write_graph(
    G: Graph,
    gerrydb_name: str,
    out_path: str | Path | None = None,
    upload_to_s3: bool = False,
    graph_file_format: GraphFileFormat = GraphFileFormat.pkl,
) -> Path:
    """Write a graph pkl to OUT_SCRATCH/graphs/ and optionally upload to S3."""
    graph_prefix = Path(settings.OUT_SCRATCH) / _S3_GRAPH_PREFIX / gerrydb_name

    if out_path:
        graph_prefix = Path(out_path)

    path = graph_file_format.write_graph(G=G, filepath=graph_prefix)
    LOGGER.info("Graph written to %s", path)

    if upload_to_s3:
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        s3_key = f"{_S3_GRAPH_PREFIX}/{graph_file_format.format_filepath(gerrydb_name)}"
        s3.upload_file(str(path), settings.S3_BUCKET, s3_key)
        LOGGER.info("Uploaded to s3://%s/%s", settings.S3_BUCKET, s3_key)

    return path


class GraphConfig(BaseModel):
    """Config for one graph entry.

    Non-shatterable maps: set ``parent_gpkg`` only.
    Shatterable maps: set both ``child_gpkg`` and ``parent_gpkg``.
    """

    parent_gpkg: str
    child_gpkg: str | None = None

    def is_shatterable(self) -> bool:
        return self.child_gpkg is not None


class GraphBatch(Config):
    """Batch config for building and uploading graph pkl files."""

    graphs: dict[str, GraphConfig]

    def create_all(
        self,
        data_dir: str | None = None,
        replace: bool = False,
        upload: bool = False,
    ) -> None:
        for gerrydb_name, cfg in self.graphs.items():
            out = Path(settings.OUT_SCRATCH) / _S3_GRAPH_PREFIX / f"{gerrydb_name}.pkl"
            if not replace and out.exists():
                LOGGER.info("Graph %s already exists, skipping", gerrydb_name)
                continue
            parent = cfg.parent_gpkg if data_dir is None else os.path.join(data_dir, cfg.parent_gpkg)
            LOGGER.info("Building graph for %r", gerrydb_name)
            if cfg.is_shatterable():
                assert cfg.child_gpkg is not None
                child = cfg.child_gpkg if data_dir is None else os.path.join(data_dir, cfg.child_gpkg)
                G = build_combined_graph_from_gpkg(child, parent)
            else:
                G = graph_from_gpkg(parent)
            write_graph(G, gerrydb_name, upload_to_s3=upload)

    def upload_all(self) -> None:
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        for gerrydb_name in self.graphs:
            path = Path(settings.OUT_SCRATCH) / _S3_GRAPH_PREFIX / f"{gerrydb_name}.pkl"
            s3_key = f"{_S3_GRAPH_PREFIX}/{gerrydb_name}.pkl"
            s3.upload_file(str(path), settings.S3_BUCKET, s3_key)
            LOGGER.info("Uploaded %s to s3://%s/%s", gerrydb_name, settings.S3_BUCKET, s3_key)
