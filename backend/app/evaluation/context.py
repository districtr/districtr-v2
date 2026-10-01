"""Information required for computing evaluation metrics for a redistricting plan.

`DocumentEvaluationContext` is the data bag passed to every metric.

`CountyContext` is a singleton (`COUNTY_CONTEXT`) holding, per gerrydb table, in memory:
  - county populations ({county_geoid: total_pop}), used by the splits metrics.
  - population-weighted Dem/Rep county win probabilities, used only by the Eguia metric.
"""

import csv
import dataclasses
import logging

from functools import cached_property
from pathlib import Path
from typing import ClassVar, Iterable, NewType, cast

import fastapi
import numpy as np
import pandas as pd
import pyproj
import shapely
import sqlalchemy
import sqlmodel
from app.core.config import settings
from app.evaluation.types import Election, CountyGeoid, DistrictId
from app.models import Assignments, DistrictUnionsResponse, DistrictrMap, Document
from app.utils import (
    update_or_select_district_stats,
    assert_safe_ident,
    get_gerrydb_numeric_cols,
    Geoid,
    GeoUnitType,
    GEOID_PREDICATES,
)

logger = logging.getLogger(__name__)

GerrydbTableName = NewType("GerrydbTableName", str)
ElectionPartyKey = NewType("ElectionPartyKey", str)
DemographicColumn = NewType("DemographicColumn", str)

TOTAL_POP_COL = "total_pop_20"


def elections_from_columns(columns: Iterable[str]) -> list[Election]:
    """Election prefixes among column names, e.g. "pres_2020" from "pres_2020_dem"."""
    return [Election(c.removesuffix("_dem")) for c in columns if c.endswith("_dem")]


def demographic_columns_from_columns(columns: Iterable[str]) -> list[DemographicColumn]:
    """Demographic population columns, e.g. "hpop_20": "pop" appears in the name,
    excluding the total and catch-all "other" aggregates.
    """
    return [
        DemographicColumn(c)
        for c in columns
        if "pop" in c and not c.startswith(("other_pop", "total_pop"))
    ]


_transformer = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:5070", always_xy=True)


def _reproject(coords: np.ndarray) -> np.ndarray:
    x, y = _transformer.transform(coords[:, 0], coords[:, 1])
    return np.stack([x, y], axis=1)


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
    def projected_district_geometries(self) -> dict[DistrictId, shapely.Geometry]:
        """Well-formed per-zone geometries projected to EPSG:5070, shared by compactness
        metrics."""
        districts = [
            d for d in self.district_stats if d.zone is not None and d.geometry
        ]
        shapes = np.array(
            [shapely.geometry.shape(d.geometry) for d in districts], dtype=object
        )
        projected = shapely.transform(shapes, _reproject)
        return {
            cast(DistrictId, d.zone): geom
            for d, geom in zip(districts, projected)
            if not geom.is_empty
        }

    @cached_property
    def demographic_data(self) -> pd.DataFrame:
        """Per-zone demographic data for non-empty districts."""
        rows = [
            {"zone": d.zone, **d.demographic_data}
            for d in self.district_stats
            if d.demographic_data and d.zone is not None
        ]
        if not rows or TOTAL_POP_COL not in rows[0]:
            raise ValueError("No demographic data available for this document.")
        return pd.DataFrame(rows).set_index("zone")

    @cached_property
    def elections(self) -> list[Election]:
        """Election prefixes for demographic columns (e.g. "pres_2020")"""
        return elections_from_columns(self.demographic_data.columns)

    @cached_property
    def demographic_columns(self) -> list[DemographicColumn]:
        """Demographic columns (e.g. "hpop_20")"""
        return demographic_columns_from_columns(self.demographic_data.columns)

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
        return {col: int(self.dem_wins[col].sum()) for col in self.elections}

    @cached_property
    def rep_seats(self) -> dict[Election, int]:
        """Total Rep seats statewide for each election."""
        return {col: int(self.rep_wins[col].sum()) for col in self.elections}

    @cached_property
    def dem_votes(self) -> dict[Election, pd.Series]:
        """Dem votes per district for each election."""
        return {col: self.demographic_data[col + "_dem"] for col in self.elections}

    @cached_property
    def rep_votes(self) -> dict[Election, pd.Series]:
        """Rep votes per district for each election."""
        return {col: self.demographic_data[col + "_rep"] for col in self.elections}

    @cached_property
    def total_votes(self) -> dict[Election, pd.Series]:
        """Total votes per district for each election."""
        return {
            col: self.dem_votes[col] + self.rep_votes[col] for col in self.elections
        }

    @cached_property
    def dem_state_votes(self) -> dict[Election, int]:
        """Total Dem votes statewide for each election."""
        return {col: int(self.dem_votes[col].sum()) for col in self.elections}

    @cached_property
    def rep_state_votes(self) -> dict[Election, int]:
        """Total Rep votes statewide for each election."""
        return {col: int(self.rep_votes[col].sum()) for col in self.elections}

    @cached_property
    def total_state_votes(self) -> dict[Election, int]:
        """Total votes statewide for each election."""
        return {col: int(self.total_votes[col].sum()) for col in self.elections}

    @cached_property
    def num_nonempty_districts(self) -> int:
        """Number of districts with an assigned zone."""
        return sum(1 for d in self.district_stats if d.zone is not None)

    @cached_property
    def total_population(self) -> int:
        """Total population across all geographic units (assigned and unassigned)."""
        return sum(
            d.demographic_data[TOTAL_POP_COL]
            for d in self.district_stats
            if (
                d.demographic_data
                and TOTAL_POP_COL in d.demographic_data
                and d.demographic_data[TOTAL_POP_COL] is not None
            )
        )

    @cached_property
    def unassigned_population(self) -> int:
        """Unassigned population and total state population."""
        unassigned = next((d for d in self.district_stats if d.zone is None), None)
        if (
            unassigned is None
            or not unassigned.demographic_data
            or TOTAL_POP_COL not in unassigned.demographic_data
        ):
            raise ValueError("No demographic data available for unassigned population.")
        return int(unassigned.demographic_data[TOTAL_POP_COL])

    @cached_property
    def ideal_population(self) -> int:
        """Ideal population per district (total population ÷ document's number of districts).

        Falls back to the map's default when the document has not set its own
        (e.g. `num_districts_modifiable` maps let the document override the map default).
        """
        num_districts = (
            self._document.num_districts or self._districtr_map.num_districts
        )
        if not num_districts:
            raise ValueError(f"Document '{self.document_id}' has no num_districts set.")
        return self.total_population // num_districts

    @cached_property
    def _document(self) -> Document:
        """The Document row associated with this evaluation context."""
        d = self.session.exec(
            sqlmodel.select(Document).where(
                sqlmodel.col(Document.document_id) == self.document_id
            )
        ).one_or_none()
        if d is None:
            raise ValueError(f"No Document found for document_id '{self.document_id}'.")
        return d

    @cached_property
    def _districtr_map(self) -> DistrictrMap:
        """The DistrictrMap associated with this document."""
        m = self.session.exec(
            sqlmodel.select(DistrictrMap)
            .join(
                Document,
                sqlmodel.col(Document.districtr_map_slug)
                == sqlmodel.col(DistrictrMap.districtr_map_slug),
            )
            .where(sqlmodel.col(Document.document_id) == self.document_id)
        ).one_or_none()
        if m is None:
            raise ValueError(
                f"No DistrictrMap found for document '{self.document_id}'."
            )
        return m

    @cached_property
    def gerrydb_table(self) -> GerrydbTableName:
        """The document's gerrydb table name (may be a shatterable UNION ALL view)."""
        m = self._districtr_map
        if not m.gerrydb_table_name:
            raise ValueError(
                f"Document '{self.document_id}' has no gerrydb table name."
            )
        return GerrydbTableName(m.gerrydb_table_name)

    @cached_property
    def parent_layer(self) -> GerrydbTableName:
        """The parent-layer gerrydb table name, used for county-level aggregation."""
        m = self._districtr_map
        if not m.parent_layer:
            raise ValueError(f"Document '{self.document_id}' has no parent layer.")
        return GerrydbTableName(m.parent_layer)

    @cached_property
    def child_layer(self) -> GerrydbTableName | None:
        """The child (block-level) gerrydb table name, or `None` for non-shatterable maps."""
        m = self._districtr_map
        return GerrydbTableName(m.child_layer) if m.child_layer else None

    @cached_property
    def is_shatterable(self) -> bool:
        """Whether this map has a child (block) layer."""
        return self.child_layer is not None

    @cached_property
    def parent_geo_unit_type(self) -> GeoUnitType:
        """Parent unit type (e.g. 'vtd', 'block'). Raises ValueError if unset in districtrmap"""
        if not self._districtr_map.parent_geo_unit_type:
            raise ValueError(
                f"DistrictrMap for document '{self.document_id}' has no parent_geo_unit_type set."
            )
        return self._districtr_map.parent_geo_unit_type

    @cached_property
    def num_parent_units(self) -> int:
        """Total number of units in the parent layer."""
        return self.session.execute(
            sqlalchemy.text(
                f"SELECT count(*) FROM gerrydb.{assert_safe_ident(self.parent_layer)}"
            )
        ).scalar()

    @cached_property
    def num_child_units(self) -> int | None:
        """Total number of child (block) units, or None for non-shatterable maps."""
        if not self.is_shatterable:
            return None
        return self.session.execute(
            sqlalchemy.text(
                f"SELECT count(*) FROM gerrydb.{assert_safe_ident(self.child_layer)}"
            )
        ).scalar()

    @cached_property
    def zone_assignments(self) -> list[tuple[Geoid, DistrictId]]:
        """Assignment rows for this document."""
        rows = self.session.exec(
            sqlmodel.select(Assignments.geo_id, Assignments.zone)
            .where(sqlmodel.col(Assignments.document_id) == self.document_id)
            .where(sqlmodel.col(Assignments.zone).isnot(None))
        ).all()
        return [(Geoid(geo_id), DistrictId(zone)) for geo_id, zone in rows]

    @cached_property
    def split_zone_assignments(
        self,
    ) -> tuple[dict[Geoid, DistrictId], dict[Geoid, DistrictId]]:
        """Assignment rows split into (unit_to_zone, parent_unit_to_zone).

        unit_to_zone        — individually-assigned child units (bare block IDs)
                              or all units for non-shatterable maps.
        parent_unit_to_zone — whole-parent assignments (colon-prefixed geo_ids)
        """
        unit_to_zone: dict[Geoid, DistrictId] = {}
        parent_unit_to_zone: dict[Geoid, DistrictId] = {}
        if self.is_shatterable:
            is_parent = GEOID_PREDICATES[self.parent_geo_unit_type]
            for geo_id, zone in self.zone_assignments:
                (parent_unit_to_zone if is_parent(geo_id) else unit_to_zone)[geo_id] = (
                    zone
                )
        else:
            for geo_id, zone in self.zone_assignments:
                unit_to_zone[geo_id] = zone
        return unit_to_zone, parent_unit_to_zone


@dataclasses.dataclass(frozen=True)
class CountyTable:
    """One parent layer's counties, aggregated from its units."""

    populations: dict[CountyGeoid, int]
    # Per ElectionPartyKey (e.g. "pres_2020_dem"): the party's seat share if
    # districts were drawn at county granularity, weighted by population.
    ideals: dict[ElectionPartyKey, float]


@dataclasses.dataclass
class CountyContext:
    """A singleton holding per-gerrydb-table county data in process memory: county
    populations for the splits metrics and Eguia ideals, which are compared to the
    plan's seat outcomes to compute the Eguia metric.

    Keyed by gerrydb_table_name rather than state FIPS so that multi-state regions
    (e.g. Navajo Nation) are handled correctly — a single gerrydb table may span
    counties in several states.

    A table is loaded on first request by one aggregate query over its units. A
    key missing from the loaded ideals (e.g. an election column added to the table
    since) reloads the table; a key still missing afterwards falls back to 0.0.
    """

    # Stop retrying after this many consecutive empty results to avoid hammering
    # the DB indefinitely for a permanently malformed gerrydb table.
    MAX_LOAD_ATTEMPTS: ClassVar[int] = 3

    _DATA_DIR: ClassVar[Path] = Path(settings.VOLUME_PATH)
    _COUNTY_NAMES_FILE: ClassVar[Path] = _DATA_DIR / "county_names.csv"
    _COUNTY_NAMES_S3_KEY: ClassVar[str] = "reference/county_names.csv"

    _tables: dict[GerrydbTableName, CountyTable] = dataclasses.field(
        default_factory=dict
    )
    _name_cache: dict[CountyGeoid, str] = dataclasses.field(default_factory=dict)
    _attempts: dict[GerrydbTableName, int] = dataclasses.field(default_factory=dict)

    def _load_county_names(self) -> dict[CountyGeoid, str]:
        """Load county geoid→name mapping from CSV, downloading from S3 first if absent."""
        if not self._COUNTY_NAMES_FILE.exists():
            self._fetch_county_names_file()
        result: dict[CountyGeoid, str] = {}
        with self._COUNTY_NAMES_FILE.open(newline="") as f:
            for row in csv.DictReader(f):
                result[CountyGeoid(row["geoid"])] = row["name"]
        return result

    def _fetch_county_names_file(self) -> None:
        """Download county names CSV from S3 and cache locally."""
        # TODO Make this consistent with s3 streaming now that s3 reads have no cost
        logger.info("Downloading county names from S3 to %s", self._COUNTY_NAMES_FILE)
        self._DATA_DIR.mkdir(parents=True, exist_ok=True)
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        s3.download_file(
            settings.AWS_S3_BUCKET,
            self._COUNTY_NAMES_S3_KEY,
            str(self._COUNTY_NAMES_FILE),
        )

    def county_name(self, geoid: CountyGeoid) -> str:
        """Return the county name for `geoid` (e.g. "01001" → "Autauga County").

        Raises KeyError if the geoid is not in the Census county reference data.
        """
        if not self._name_cache:
            self._name_cache = self._load_county_names()
        return self._name_cache[geoid]

    def county_populations(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> dict[CountyGeoid, int]:
        """Return a {county_geoid: total_pop} dict for `gerrydb_table`."""
        return self._table(gerrydb_table, session).populations

    def eguia_ideal(
        self,
        gerrydb_table: GerrydbTableName,
        key: ElectionPartyKey,
        session: sqlmodel.Session,
    ) -> float:
        """Return the Eguia ideal for `key`, reloading the table if `key` is absent."""
        if key in (ideals := self._table(gerrydb_table, session).ideals):
            return ideals[key]
        self._tables[gerrydb_table] = self._load(gerrydb_table, session)
        ideal = self._tables[gerrydb_table].ideals.get(key)
        if ideal is None:
            logger.warning(
                "No Eguia ideal for %s in %s after reloading its counties",
                key,
                gerrydb_table,
            )
            return 0.0
        return ideal

    def _table(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> CountyTable:
        """Return `gerrydb_table`'s counties, loading them on first request.

        Raises ValueError if the table can't be aggregated. Retried up to
        `MAX_LOAD_ATTEMPTS` times before raising to avoid hammering the DB.
        """
        if gerrydb_table in self._tables:
            return self._tables[gerrydb_table]
        if self._attempts.get(gerrydb_table, 0) >= self.MAX_LOAD_ATTEMPTS:
            raise ValueError(
                f"County data for '{gerrydb_table}' failed to load after "
                f"{self.MAX_LOAD_ATTEMPTS} attempts."
            )
        self._attempts[gerrydb_table] = self._attempts.get(gerrydb_table, 0) + 1
        self._tables[gerrydb_table] = self._load(gerrydb_table, session)
        return self._tables[gerrydb_table]

    def _load(
        self, gerrydb_table: GerrydbTableName, session: sqlmodel.Session
    ) -> CountyTable:
        """Aggregate `gerrydb_table`'s units to counties and derive the Eguia ideals.

        Extracts the county GEOID (first 5 characters) from each row's path,
        handling both colon-prefixed paths (e.g. ``vtd:20051XXXX`` → ``20051``)
        and bare block paths (e.g. ``200510726002341`` → ``20051``).
        """
        safe_table = assert_safe_ident(gerrydb_table)

        # Must be a plain table (relkind='r'). Materialized views created by
        # create_shatterable_gerrydb_view are UNION ALL of parent + child layers;
        # aggregating them up to county level would double-count every row.
        # Callers must pass the plain parent layer, not the combined view.
        relkind = session.execute(
            sqlalchemy.text(
                "SELECT relkind FROM pg_class "
                "JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid "
                "WHERE relname = :name AND nspname = 'gerrydb'"
            ),
            {"name": gerrydb_table},
        ).scalar_one_or_none()
        if relkind != "r":
            raise ValueError(
                f"County aggregation requires a plain table (relkind='r'), "
                f"got relkind={relkind!r} for '{gerrydb_table}'. "
                f"Pass the parent layer table, not the combined shatterable view."
            )

        numeric_cols = set(get_gerrydb_numeric_cols(session, safe_table))
        if TOTAL_POP_COL not in numeric_cols:
            raise ValueError(
                f"Gerrydb table '{gerrydb_table}' has no numeric {TOTAL_POP_COL} column."
            )
        elections = [
            e
            for e in elections_from_columns(sorted(numeric_cols))
            if f"{e}_rep" in numeric_cols
        ]
        summed = [TOTAL_POP_COL] + [
            f"{e}_{party}" for e in elections for party in ("dem", "rep")
        ]
        sums_sql = ", ".join(f"SUM({col}) AS {col}" for col in summed)
        rows = session.execute(
            sqlalchemy.text(f"""
                SELECT
                    CASE
                        WHEN path LIKE '%:%' THEN LEFT(SPLIT_PART(path, ':', 2), 5)
                        ELSE LEFT(path, 5)
                    END AS geoid,
                    {sums_sql}
                FROM gerrydb.{safe_table}
                GROUP BY 1
            """)
        ).all()
        if not rows:
            raise ValueError(f"Gerrydb table '{gerrydb_table}' has no rows.")

        counties = (
            pd.DataFrame(rows, columns=["geoid", *summed])
            .set_index("geoid")
            .astype(float)
            .fillna(0)
        )
        return CountyTable(
            populations={
                CountyGeoid(geoid): int(pop)
                for geoid, pop in counties[TOTAL_POP_COL].items()
                if geoid
            },
            ideals=self._compute_ideal(counties),
        )

    @staticmethod
    def _compute_ideal(df: pd.DataFrame) -> dict[ElectionPartyKey, float]:
        """Population-weighted county-level Dem/Rep win frequency per election.

        `df` has one row per county, a `total_pop_20` column and, per election,
        `<election>_dem` and `<election>_rep` vote columns. For the Dem key:

            ideal = sum_c (p_c * 1{dem_c > rep_c}) / sum_c p_c

        and symmetrically for Rep; a tied county counts for neither party.
        """
        county_pops = df[TOTAL_POP_COL].to_numpy()
        total_pop = county_pops.sum()
        if total_pop == 0:
            raise ValueError("Total county population is zero.")

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
