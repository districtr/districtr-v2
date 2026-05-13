"""Information required for computing evaluation metrics for a redistricting plan.

`DocumentEvaluationContext` is the data bag passed to every metric.

`CountyContext` is a singleton (`COUNTY_CONTEXT`) holding two per-gerrydb-table caches:
  - county populations ({county_geoid: total_pop}), used by splits and Eguia metrics.
  - population-weighted Dem/Rep county win probabilities, used only by the Eguia metric.
"""

import dataclasses
import logging
import pickle
import sqlite3
from collections import OrderedDict
from enum import Enum
from functools import cached_property
from pathlib import Path
from typing import ClassVar, NewType
from urllib.parse import urlparse

import botocore.exceptions
import fastapi
import numpy as np
import pandas as pd
import sqlalchemy
import sqlmodel
from networkx import Graph, read_gml, write_gml

from app.core.config import settings, Environment
from app.core.io import download_file_from_s3
from app.evaluation.models import CountyDemographics
from app.models import DistrictUnionsResponse, DistrictrMap, Document
from app.utils import (
    update_or_select_district_stats,
    assert_safe_ident,
    get_gerrydb_numeric_cols,
)

logger = logging.getLogger(__name__)

GerrydbTableName = NewType("GerrydbTableName", str)
Election = NewType("Election", str)
ElectionPartyKey = NewType("ElectionPartyKey", str)
CountyGeoid = NewType("CountyGeoid", str)

TOTAL_POP_COL = "total_pop_20"

@dataclasses.dataclass
class DocumentEvaluationContext:
    """Lazy, per-document inputs for computing all evaluation metrics.

    Some intermediates used by multiple metrics (e.g. `dem_wins`, `dem_seats`) are
    calculated here as `@cached_property` to avoid redundant work across metrics.
    """

    background_tasks: fastapi.BackgroundTasks
    session: sqlmodel.Session
    document_id: str

    @cached_property
    def district_stats(self) -> list[DistrictUnionsResponse]:
        """Per-zone stats for this document."""
        return update_or_select_district_stats(
            self.session, self.document_id, self.background_tasks
        )

    @cached_property
    def demographic_data(self) -> pd.DataFrame:
        """Per-zone demographic data for non-empty districts."""
        rows = [
            {"zone": d.zone, **d.demographic_data}
            for d in self.district_stats
            if d.demographic_data and d.zone is not None
        ]
        return pd.DataFrame(rows).set_index("zone") if rows else pd.DataFrame()

    @cached_property
    def elections(self) -> list[Election]:
        """Election prefixes for demographic columns (e.g. "pres_2020")"""
        return [
            Election(s.removesuffix("_dem"))
            for s in self.demographic_data.columns
            if s.endswith("_dem")
        ]

    @cached_property
    def dem_wins(self) -> dict[Election, pd.Series]:
        """Boolean Series per election of whether Dems won each district."""
        return {
            col: self.demographic_data[col + "_dem"]
            > self.demographic_data[col + "_rep"]
            for col in self.elections
        }

    @cached_property
    def rep_wins(self) -> dict[Election, pd.Series]:
        """Boolean Series per election of whether Reps won each district."""
        return {
            col: self.demographic_data[col + "_rep"]
            > self.demographic_data[col + "_dem"]
            for col in self.elections
        }

    @cached_property
    def dem_seats(self) -> dict[Election, int]:
        """Total Dem seats statewide for each election."""
        return {col: sum(self.dem_wins[col]) for col in self.elections}

    @cached_property
    def rep_seats(self) -> dict[Election, int]:
        """Total Rep seats statewide for each election."""
        return {col: sum(self.rep_wins[col]) for col in self.elections}

    @cached_property
    def num_nonempty_districts(self) -> int:
        """Number of districts with an assigned zone."""
        return sum(1 for d in self.district_stats if d.zone is not None)
    
    @cached_property
    def ideal_population(self) -> int:
        """Ideal population per district."""
        total_pop = sum(
            d.demographic_data[TOTAL_POP_COL]
            for d in self.district_stats
            if (d.demographic_data and TOTAL_POP_COL in d.demographic_data
                and d.demographic_data[TOTAL_POP_COL] is not None)
        )
        return total_pop // self.num_nonempty_districts
    
    @cached_property
    def _districtr_map(self) -> DistrictrMap | None:
        """The DistrictrMap associated with this document. Cached to avoid repeated DB hits."""
        return self.session.exec(
            sqlmodel.select(DistrictrMap)
            .join(Document, Document.districtr_map_slug == DistrictrMap.districtr_map_slug)
            .where(Document.document_id == self.document_id)
        ).one_or_none()

    @cached_property
    def gerrydb_table(self) -> GerrydbTableName | None:
        """Resolve the document's gerrydb table name. Returns `None` if unavailable."""
        m = self._districtr_map
        return GerrydbTableName(m.gerrydb_table_name) if m and m.gerrydb_table_name else None

    @cached_property
    def child_layer(self) -> GerrydbTableName | None:
        """The child (block-level) gerrydb table name, or `None` for non-shatterable maps."""
        m = self._districtr_map
        return GerrydbTableName(m.child_layer) if m and m.child_layer else None


    @cached_property
    def _districtr_map(self) -> DistrictrMap | None:
        """The DistrictrMap associated with this document."""
        return self.session.exec(
            sqlmodel.select(DistrictrMap)
            .join(Document, Document.districtr_map_slug == DistrictrMap.districtr_map_slug)
            .where(Document.document_id == self.document_id)
        ).one_or_none()

    @cached_property
    def gerrydb_table(self) -> GerrydbTableName | None:
        """The document's gerrydb table name (may be a shatterable UNION ALL view)."""
        m = self._districtr_map
        return GerrydbTableName(m.gerrydb_table_name) if m and m.gerrydb_table_name else None

    @cached_property
    def parent_layer(self) -> GerrydbTableName | None:
        """The parent-layer gerrydb table name, used for county-level aggregation."""
        m = self._districtr_map
        return GerrydbTableName(m.parent_layer) if m else None

    @cached_property
    def child_layer(self) -> GerrydbTableName | None:
        """The child (block-level) gerrydb table name, or `None` for non-shatterable maps."""
        m = self._districtr_map
        return GerrydbTableName(m.child_layer) if m and m.child_layer else None


@dataclasses.dataclass
class CountyContext:
    """A singleton lookup of per-gerrydb-table Eguia ideals, which are compared to the
    plan's seat outcomes to compute the Eguia metric.

    For each gerrydb table name, records a mapping between election+party string (e.g.
    "pres_2020_dem") and this party's seat share that would emerge if districts were
    drawn at county granularity, weighted by population.

    Keyed by gerrydb_table_name rather than state FIPS so that multi-state regions
    (e.g. Navajo Nation) are handled correctly — a single gerrydb table may span
    counties in several states.

    Computed on first request and never recomputed.
    """

    # Stop retrying after this many consecutive empty results to avoid hammering
    # the DB indefinitely for a permanently malformed gerrydb table.
    MAX_LOAD_ATTEMPTS: ClassVar[int] = 3

    _cache: dict[GerrydbTableName, dict[ElectionPartyKey, float]] = dataclasses.field(default_factory=dict)
    _pop_cache: dict[GerrydbTableName, dict[CountyGeoid, int]] = dataclasses.field(default_factory=dict)
    _attempts: dict[GerrydbTableName, int] = dataclasses.field(default_factory=dict)

    def county_populations(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> dict[CountyGeoid, int]:
        """Return a {county_geoid: total_pop} dict for `gerrydb_table`.

        Cached after first load. Returns an empty dict if county data is unavailable
        (e.g. gerrydb table lacks total_pop_20). Retried up to MAX_LOAD_ATTEMPTS times.
        """
        cached = self._pop_cache.get(gerrydb_table)
        if cached is not None:
            return cached
        if self._attempts.get(gerrydb_table, 0) >= self.MAX_LOAD_ATTEMPTS:
            return {}
        self._attempts[gerrydb_table] = self._attempts.get(gerrydb_table, 0) + 1
        self._ensure_county_data(gerrydb_table, session)
        rows = session.exec(
            sqlmodel.select(CountyDemographics.geoid, CountyDemographics.total_pop).where(
                CountyDemographics.gerrydb_table_name == gerrydb_table
            )
        ).all()
        pops = {
            CountyGeoid(geoid): int(total_pop)
            for geoid, total_pop in rows
            if geoid and total_pop is not None
        }
        self._pop_cache[gerrydb_table] = pops
        return pops

    def ideals_for_eguia(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> dict[ElectionPartyKey, float]:
        """Return the per-ElectionPartyKey seat share expectation dict for `gerrydb_table`.

        Args:
            gerrydb_table: Source VTD/block table whose county-level aggregates
                back the ideal. Used both as the cache key and to populate
                `evaluation.county_demographics` on first request.
            session: SQLModel session for any required DB queries.

        A cached non-empty result is returned immediately. A cached empty result
        (`{}`) means a prior attempt failed; the call is retried up to
        `MAX_LOAD_ATTEMPTS` times. After that the singleton returns `{}` without
        touching the DB, gracefully handling permanently malformed gerrydb tables.
        """
        cached = self._cache.get(gerrydb_table)
        if cached:
            return cached
        if self._attempts.get(gerrydb_table, 0) >= self.MAX_LOAD_ATTEMPTS:
            return {}
        self._attempts[gerrydb_table] = self._attempts.get(gerrydb_table, 0) + 1
        self._ensure_county_data(gerrydb_table, session)
        self._cache[gerrydb_table] = self._compute_ideal(gerrydb_table, session)
        return self._cache[gerrydb_table]

    def _ensure_county_data(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> None:
        """Populate `evaluation.county_demographics` for `gerrydb_table` unless at
        least one row with a non-null total_pop already exists.

        Requiring total_pop IS NOT NULL (rather than mere row existence) guards
        against a previous load that inserted rows without population data (e.g.
        because the gerrydb table lacked total_pop_20). Those rows are present but
        unusable, so we attempt re-population rather than treating them as a
        successful prior load.
        """
        exists = session.exec(
            sqlmodel.select(CountyDemographics)
            .where(CountyDemographics.gerrydb_table_name == gerrydb_table)
            .where(CountyDemographics.total_pop.isnot(None))
            .limit(1)
        ).first()
        if not exists:
            self._populate_county_data(gerrydb_table, session)

    def _populate_county_data(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> None:
        """Aggregate unit-level demographics up to county level.

        Extracts the county GEOID (first 5 characters) from each row's path,
        handling both colon-prefixed paths (e.g. ``vtd:20051XXXX`` → ``20051``)
        and bare block paths (e.g. ``200510726002341`` → ``20051``).
        """
        safe_table = assert_safe_ident(gerrydb_table)

        # Guard: skip if this is not a plain table (relkind='r'). Materialized views
        # created by create_shatterable_gerrydb_view are UNION ALL of parent + child
        # layers; aggregating them up to county level would double-count every row.
        relkind = session.execute(
            sqlalchemy.text(
                "SELECT relkind FROM pg_class "
                "JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid "
                "WHERE relname = :name AND nspname = 'gerrydb'"
            ),
            {"name": gerrydb_table},
        ).scalar_one_or_none()
        if relkind != "r":
            return

        demo_cols = get_gerrydb_numeric_cols(session, safe_table)

        if not demo_cols:
            return
        json_pairs = [f"'{col}', SUM({col})" for col in demo_cols]
        demographic_json = f"json_build_object({', '.join(json_pairs)})"
        total_pop_expr = "SUM(total_pop_20)" if "total_pop_20" in demo_cols else "NULL"

        insert_sql = f"""
            INSERT INTO evaluation.county_demographics (geoid, gerrydb_table_name, total_pop, demographic_data)
            SELECT
                CASE
                    WHEN path LIKE '%:%' THEN LEFT(SPLIT_PART(path, ':', 2), 5)
                    ELSE LEFT(path, 5)
                END AS geoid,
                :gerrydb_table AS gerrydb_table_name,
                {total_pop_expr} AS total_pop,
                {demographic_json} AS demographic_data
            FROM gerrydb.{safe_table}
            GROUP BY geoid
            ON CONFLICT (geoid, gerrydb_table_name) DO NOTHING
        """
        session.execute(sqlalchemy.text(insert_sql), {"gerrydb_table": gerrydb_table})
        session.commit()

    def _compute_ideal(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> dict[ElectionPartyKey, float]:
        """Population-weighted county-level Dem/Rep win frequency per election."""
        rows = session.exec(
            sqlmodel.select(CountyDemographics).where(
                CountyDemographics.gerrydb_table_name == gerrydb_table
            )
        ).all()

        if not rows:
            return {}

        df = pd.DataFrame([r.demographic_data or {} for r in rows])
        county_pops = pd.array([r.total_pop or 0 for r in rows], dtype="int64")
        total_pop = county_pops.sum()
        if total_pop == 0:
            return {}

        dem_cols: list[ElectionPartyKey] = [
            ElectionPartyKey(c) for c in df.columns if c.endswith("_dem")
        ]
        ideals: dict[ElectionPartyKey, float] = {}
        for dem_col in dem_cols:
            base = dem_col.removesuffix("_dem")
            rep_col = ElectionPartyKey(f"{base}_rep")
            if rep_col not in df.columns:
                continue
            results_dem = df[dem_col] > df[rep_col]
            results_rep = df[rep_col] > df[dem_col]
            ideals[dem_col] = float(np.dot(results_dem, county_pops) / total_pop)
            ideals[rep_col] = float(np.dot(results_rep, county_pops) / total_pop)

        return ideals


# Server-owned singleton. Shared across all requests; one entry per gerrydb table.
COUNTY_CONTEXT = CountyContext()


# ---------------------------------------------------------------------------
# Graph file utilities (moved from app.contiguity.main)
# ---------------------------------------------------------------------------

_S3_GRAPH_PREFIX = "graphs"


class GraphFileFormat(str, Enum):
    gml = "Graph Modeling Language"
    pkl = "Pickle"

    def format_filepath(self, filepath: str | Path) -> Path:
        if self == GraphFileFormat.gml:
            return Path(f"{filepath}.gml.gz")
        elif self == GraphFileFormat.pkl:
            return Path(f"{filepath}.pkl")
        raise NotImplementedError(f"{self} filepath format unsupported")

    def read_graph(self, filepath: str | Path) -> Graph:
        if self == GraphFileFormat.gml:
            return read_gml(filepath)
        elif self == GraphFileFormat.pkl:
            with open(filepath, "rb") as f:
                return pickle.load(f)
        raise NotImplementedError(f"{self} read format unsupported")

    def write_graph(self, G: Graph, filepath: str | Path) -> Path:
        out_path = self.format_filepath(filepath=filepath)
        if self == GraphFileFormat.gml:
            write_gml(G=G, path=out_path)
        elif self == GraphFileFormat.pkl:
            with open(out_path, "wb") as f:
                pickle.dump(obj=G, file=f)
        return out_path


def get_gerrydb_graph_file(
    gerrydb_name: str,
    prefix: str = settings.VOLUME_PATH,
    graph_file_format: GraphFileFormat = GraphFileFormat.pkl,
) -> str:
    """Resolve the path to a GerryDB graph file.

    Checks for a local copy first; falls back to S3 if absent.
    """
    possible_local_path = graph_file_format.format_filepath(
        f"{Path(prefix) / _S3_GRAPH_PREFIX}/{gerrydb_name}"
    )
    logger.info("Possible local path: %s", possible_local_path)

    if possible_local_path.exists():
        logger.info("Local path exists")
        return str(possible_local_path)

    logger.info("Local path does not exist, checking S3")
    s3_prefix = graph_file_format.format_filepath(gerrydb_name)
    s3_key = f"{_S3_GRAPH_PREFIX}/{s3_prefix}"
    logger.info("S3 key: %s", s3_key)

    s3 = settings.get_s3_client()
    assert s3, "S3 client is not available"
    s3.head_object(Bucket=settings.R2_BUCKET_NAME, Key=s3_key)

    return f"s3://{settings.R2_BUCKET_NAME}/{s3_key}"


def get_gerrydb_block_graph(
    file_path: str,
    replace_local_copy: bool = False,
    graph_file_format: GraphFileFormat = GraphFileFormat.pkl,
) -> Graph:
    """Load a GerryDB block graph from a local path or an S3 URI."""
    url = urlparse(file_path)
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        path = download_file_from_s3(s3=s3, url=url, replace=replace_local_copy)
    else:
        path = file_path

    logger.info("Path: %s", path)
    return graph_file_format.read_graph(path)


def graph_from_gpkg(
    gpkg_path: str | Path, layer_name: str = "gerrydb_graph_edge"
) -> Graph:
    """Load a GerryDB block graph from a GeoPackage edge layer."""
    url = urlparse(str(gpkg_path))
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        logger.info("Downloading file from S3")
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        gpkg_path = download_file_from_s3(s3=s3, url=url, replace=False)
        logger.info("Path: %s", gpkg_path)

    conn = sqlite3.connect(gpkg_path)
    cursor = conn.execute(f"SELECT path_1, path_2 FROM {layer_name}")
    edgelist = cursor.fetchall()
    logger.info("Num edges %s", len(edgelist))
    return Graph(edgelist)


def write_graph(
    G: Graph,
    gerrydb_name: str,
    out_path: str | Path | None = None,
    upload_to_s3: bool = False,
    graph_file_format: GraphFileFormat = GraphFileFormat.pkl,
) -> Path:
    """Write a graph file to the VOLUME_PATH directory. Defaults to a pickle.

    Args:
        G: Graph to write.
        gerrydb_name: Name of the GerryDB table; used to name the graph file.
        out_path: Override output path. Only allowed in local/test environments.
        upload_to_s3: Whether to upload the graph file to S3.
        graph_file_format: Serialisation format (gml or pkl).

    Returns:
        Path to the exported graph file.
    """
    graph_prefix = Path(settings.VOLUME_PATH) / gerrydb_name

    if out_path:
        assert settings.ENVIRONMENT in (
            Environment.local,
            Environment.test,
        ), "out_path can only be specified in local or test environment"
        graph_prefix = Path(out_path)

    path = graph_file_format.write_graph(G=G, filepath=graph_prefix)

    if upload_to_s3:
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        s3_filename = graph_file_format.write_graph(G=G, filepath=gerrydb_name)
        logger.info(f"S3 filename: {s3_filename}")
        s3.upload_file(
            str(path), settings.R2_BUCKET_NAME, f"{_S3_GRAPH_PREFIX}/{s3_filename}"
        )
        logger.info(
            f"Graph file uploaded to S3 at "
            f"s3://{settings.R2_BUCKET_NAME}/{_S3_GRAPH_PREFIX}/{s3_filename}"
        )

    return path


class GraphLayerType(str, Enum):
    """Structural type of a graph's nodes, inferred from path format at load time."""
    block = "block"  # bare 15-digit census block IDs — eligible for parent annotation
    vtd   = "vtd"    # vtd:xxxxx prefixed paths
    bg    = "bg"     # bg:xxxxx prefixed paths
    other = "other"  # municipal units or unrecognised format


class GraphState(str, Enum):
    """Lifecycle state of a CachedGraph entry.

    Encodes both how the graph was obtained and what processing has been applied,
    eliminating the need for a separate boolean flag.

    loaded     — read from disk/S3; no parent node attributes attached yet.
    annotated  — loaded block graph with ``parent`` node attributes attached
                 (block → parent-unit path). Transition: loaded → annotated
                 via ``GraphContext.ensure_parent_annotations``.
                 Only reachable when layer_type == block.
    aggregated — weighted parent-unit adjacency graph derived from an annotated
                 block graph. Each node is a parent unit (vtd/bg); each edge
                 weight is the number of block edges crossing that boundary.
                 Lives in ``GraphContext._parent_unit_adjacency``, never evicted.
    """
    loaded     = "loaded"
    annotated  = "annotated"
    aggregated = "aggregated"


def _infer_layer_type(G: Graph) -> GraphLayerType:
    """Infer GraphLayerType from the format of graph node identifiers."""
    sample = next(iter(G.nodes), None)
    if sample is None:
        return GraphLayerType.other
    s = str(sample)
    if ":" not in s:
        return GraphLayerType.block
    prefix = s.split(":", 1)[0]
    try:
        return GraphLayerType(prefix)
    except ValueError:
        return GraphLayerType.other


@dataclasses.dataclass
class CachedGraph:
    """A graph together with its type metadata and lifecycle state.

    Used as the value type for both ``GraphContext._cache`` (evictable, loaded
    graphs) and ``GraphContext._parent_unit_adjacency`` (non-evictable, derived
    graphs).  Having a single value type means the key string carries no implicit
    type information — all type information lives here.

    Valid (layer_type, state) combinations:

        block  + loaded     — block graph freshly loaded, no parent attrs yet
        block  + annotated  — block graph with ``parent`` node attrs attached
        vtd/bg + loaded     — standalone parent-layer graph (non-shatterable map)
        vtd/bg + aggregated — derived weighted parent-unit adjacency graph
        other  + loaded     — municipal or unrecognised unit graph

    Invalid combinations (should never be created):
        block  + aggregated — aggregation produces vtd/bg nodes, not block nodes
        any    + annotated  — only block graphs receive parent annotations
        (except block + annotated above)
    """
    gerrydb_name: str      # for aggregated entries: the child_layer name it was built from
    graph: Graph
    layer_type: GraphLayerType
    state: GraphState


@dataclasses.dataclass
class GraphContext:
    """Server-owned singleton LRU cache for GerryDB graphs.

    ``_cache`` holds loaded graphs (block, vtd, bg, or other) keyed by gerrydb
    table name, evicted LRU when full.  Each entry is a ``CachedGraph`` whose
    ``layer_type`` and ``state`` fields describe the graph's structure and how
    much processing has been applied.

    ``_parent_unit_adjacency`` holds derived weighted adjacency graphs keyed by
    the child-layer gerrydb name they were built from.  These are never evicted:
    the topology is stable across block-graph cache misses, so re-deriving them
    is unnecessary.  When a block graph is evicted and reloaded its new
    ``CachedGraph`` entry starts in state ``loaded``; ``ensure_parent_annotations``
    will re-attach node attributes, after which the already-built adjacency graph
    can be used immediately.
    """

    _max_size: int = 10
    _cache: OrderedDict[str, CachedGraph] = dataclasses.field(default_factory=OrderedDict)
    _parent_unit_adjacency: dict[str, CachedGraph] = dataclasses.field(default_factory=dict)
    _hits: int = 0
    _misses: int = 0

    def get_graph(self, gerrydb_name: str | None) -> Graph:
        """Return a cached graph, loading from local storage / S3 on a miss.

        Raises HTTPException (404 or 500) if the graph is unavailable.
        """
        if gerrydb_name is None:
            raise fastapi.HTTPException(
                status_code=404,
                detail="No gerrydb table configured for this map.",
            )
        if gerrydb_name in self._cache:
            self._hits += 1
            self._cache.move_to_end(gerrydb_name)
            return self._cache[gerrydb_name].graph

        self._misses += 1
        try:
            path = get_gerrydb_graph_file(gerrydb_name)
            logger.info(f"Graph cache miss, loading from {path}")
            G = get_gerrydb_block_graph(path, replace_local_copy=False)
        except botocore.exceptions.ClientError as e:
            logger.error(f"Graph not found: {str(e)}")
            raise fastapi.HTTPException(
                status_code=404,
                detail="Graph unavailable. This map does not support contiguity checks.",
            )
        except Exception as e:
            logger.error(f"Unexpected error loading graph: {str(e)}")
            raise fastapi.HTTPException(
                status_code=500, detail=f"Something went wrong: {str(e)}"
            )

        if not isinstance(G, Graph):
            logger.error(f"Expected Graph, got {type(G)}")
            raise fastapi.HTTPException(status_code=500, detail="Error loading graph")

        if len(self._cache) >= self._max_size:
            evicted, _ = self._cache.popitem(last=False)
            # _parent_unit_adjacency is NOT cleared: the derived topology is stable
            # across block-graph evictions. The reloaded entry will start in state
            # ``loaded`` and be re-annotated on the next cut-edge calculation.
            logger.info(f"Evicted graph for {evicted!r}")

        self._cache[gerrydb_name] = CachedGraph(
            gerrydb_name=gerrydb_name,
            graph=G,
            layer_type=_infer_layer_type(G),
            state=GraphState.loaded,
        )
        return G

    def ensure_parent_annotations(
        self, gerrydb_name: str, map_uuid: str, session: sqlmodel.Session
    ) -> None:
        """Attach ``parent`` node attributes to all child blocks in the cached graph.

        Queries ``parentchildedges`` for the given map and stores each block's
        parent-unit path as ``G.nodes[block_id]["parent"]``.  Transitions the
        entry's state from ``loaded`` to ``annotated``.

        Silently skipped if the entry is absent, already annotated, or not a
        block-layer graph (layer_type != block).
        """
        entry = self._cache.get(gerrydb_name)
        if entry is None or entry.layer_type != GraphLayerType.block:
            return
        if entry.state == GraphState.annotated:
            return
        rows = session.execute(
            sqlalchemy.text(
                "SELECT parent_path, child_path FROM parentchildedges "
                "WHERE districtr_map = CAST(:uuid AS uuid)"
            ),
            {"uuid": map_uuid},
        ).fetchall()
        for parent_path, child_path in rows:
            if child_path in entry.graph.nodes:
                entry.graph.nodes[child_path]["parent"] = parent_path
        entry.state = GraphState.annotated
        logger.info(f"Annotated {len(rows)} parent edges for {gerrydb_name!r}")

    def ensure_parent_unit_adjacency(self, gerrydb_name: str) -> None:
        """Build and cache the weighted parent-unit adjacency graph for a block graph.

        Each edge in the resulting graph connects two parent units (vtd/bg nodes);
        its weight is the number of block-level edges that cross that boundary.
        The result is stored in ``_parent_unit_adjacency`` and never evicted.

        Silently skipped if the entry is absent, not yet annotated, or the
        adjacency was already built.
        """
        if gerrydb_name in self._parent_unit_adjacency:
            return
        entry = self._cache.get(gerrydb_name)
        if entry is None or entry.state != GraphState.annotated:
            return

        parent_G: Graph = Graph()
        for u, v in entry.graph.edges():
            parent_u = entry.graph.nodes[u].get("parent")
            parent_v = entry.graph.nodes[v].get("parent")
            if parent_u is None or parent_v is None or parent_u == parent_v:
                continue
            if parent_G.has_edge(parent_u, parent_v):
                parent_G[parent_u][parent_v]["weight"] += 1
            else:
                parent_G.add_edge(parent_u, parent_v, weight=1)

        self._parent_unit_adjacency[gerrydb_name] = CachedGraph(
            gerrydb_name=gerrydb_name,
            graph=parent_G,
            layer_type=_infer_layer_type(parent_G),
            state=GraphState.aggregated,
        )
        logger.info(
            f"Built parent-unit adjacency for {gerrydb_name!r}: "
            f"{parent_G.number_of_nodes()} nodes, {parent_G.number_of_edges()} edges"
        )

    def get_parent_unit_adjacency(
        self,
        gerrydb_name: str | None,
        map_uuid: str | None = None,
        session: sqlmodel.Session | None = None,
    ) -> Graph | None:
        """Return the parent-unit adjacency graph, building it lazily on a cache miss.

        When ``map_uuid`` and ``session`` are provided and the adjacency is absent,
        loads the block graph, annotates it, and derives the adjacency on demand.
        Returns ``None`` when ``gerrydb_name`` is ``None`` (non-shatterable map) or
        when the required context for building is unavailable.
        """
        if gerrydb_name is None:
            return None
        entry = self._parent_unit_adjacency.get(gerrydb_name)
        if entry is not None:
            return entry.graph
        if map_uuid is None or session is None:
            return None
        self.get_graph(gerrydb_name)
        self.ensure_parent_annotations(gerrydb_name, map_uuid, session)
        self.ensure_parent_unit_adjacency(gerrydb_name)
        entry = self._parent_unit_adjacency.get(gerrydb_name)
        return entry.graph if entry is not None else None

    def cache_info(self) -> dict:
        """Return cache statistics for the /_debug/cache endpoint."""
        return {
            "hits": self._hits,
            "misses": self._misses,
            "maxsize": self._max_size,
            "currsize": len(self._cache),
            "parent_unit_adjacency_size": len(self._parent_unit_adjacency),
        }


# Server-owned singleton. Shared across all requests; one entry per gerrydb table.
GRAPH_CONTEXT = GraphContext()
