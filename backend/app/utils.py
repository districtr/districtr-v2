from sqlalchemy import text
from sqlalchemy import bindparam, Integer, String, Text
from sqlalchemy.types import UUID
from sqlmodel import Session, Float
import logging


from app.models import UUIDType

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def create_districtr_map(
    session: Session,
    name: str,
    parent_layer_name: str,
    child_layer_name: str | None = None,
    gerrydb_table_name: str | None = None,
    num_districts: int | None = None,
    tiles_s3_path: str | None = None,
) -> str:
    """
    Create a new districtr map.

    Args:
        session: The database session.
        name: The name of the map.
        parent_layer_name: The name of the parent layer.
        child_layer_name: The name of the child layer.
        gerrydb_table_name: The name of the gerrydb table.
        num_districts: The number of districts.
        tiles_s3_path: The S3 path to the tiles.

    Returns:
        The UUID of the inserted map.
    """
    stmt = text(
        """
    SELECT *
    FROM create_districtr_map(
        :map_name,
        :gerrydb_table_name,
        :num_districts,
        :tiles_s3_path,
        :parent_layer_name,
        :child_layer_name
    )"""
    ).bindparams(
        bindparam(key="map_name", type_=String),
        bindparam(key="gerrydb_table_name", type_=String),
        bindparam(key="num_districts", type_=Integer),
        bindparam(key="tiles_s3_path", type_=String),
        bindparam(key="parent_layer_name", type_=String),
        bindparam(key="child_layer_name", type_=String),
    )

    (inserted_map_uuid,) = session.execute(
        stmt,
        {
            "map_name": name,
            "gerrydb_table_name": gerrydb_table_name,
            "num_districts": num_districts,
            "tiles_s3_path": tiles_s3_path,
            "parent_layer_name": parent_layer_name,
            "child_layer_name": child_layer_name,
        },
    )
    return inserted_map_uuid  # pyright: ignore


def create_shatterable_gerrydb_view(
    session: Session,
    parent_layer_name: str,
    child_layer_name: str,
    gerrydb_table_name: str,
) -> None:
    stmt = text(
        "CALL create_shatterable_gerrydb_view(:parent_layer_name, :child_layer_name, :gerrydb_table_name)"
    ).bindparams(
        bindparam(key="parent_layer_name", type_=Text),
        bindparam(key="child_layer_name", type_=Text),
        bindparam(key="gerrydb_table_name", type_=Text),
    )
    session.execute(
        stmt,
        {
            "parent_layer_name": parent_layer_name,
            "child_layer_name": child_layer_name,
            "gerrydb_table_name": gerrydb_table_name,
        },
    )


def create_parent_child_edges(
    session: Session,
    districtr_map_uuid: str,
) -> None:
    """
    Create the parent child edges for a given gerrydb map.

    Args:
        session: The database session.
        districtr_map_uuid: The UUID of the districtr map.
    """
    stmt = text("CALL add_parent_child_relationships(:districtr_map_uuid)").bindparams(
        bindparam(key="districtr_map_uuid", type_=UUIDType),
    )
    session.execute(
        stmt,
        {
            "districtr_map_uuid": districtr_map_uuid,
        },
    )


def add_extent_to_districtrmap(
    session: Session, districtr_map_uuid: str | UUID, bounds: list[float] | None = None
) -> None:
    """
    Add the extent to the districtr map.

    Args:
        session: The database session.
        districtr_map_uuid: The UUID of the districtr map.
        bounds: The bounds of the map.
    """
    logger.info(f"Adding extent for {districtr_map_uuid}...")

    if bounds:
        assert all(
            b is not None for b in bounds
        ), "If setting the extent manually, all values must be set."
        assert len(bounds) == 4, "The extent must have 4 values."
        assert all(isinstance(b, float) for b in bounds), "All values must be floats."
        x_min, y_min, x_max, y_max = bounds
        assert (
            x_max > x_min and y_max > y_min
        ), "The max values must be greater than the min values."
        stmt = text(
            "UPDATE districtrmap SET extent = ARRAY[:x_min, :y_min, :x_max, :y_max] WHERE uuid = :districtr_map_uuid RETURNING extent"
        ).bindparams(
            bindparam(key="districtr_map_uuid", type_=UUIDType),
            bindparam(key="x_min", type_=Float),
            bindparam(key="y_min", type_=Float),
            bindparam(key="x_max", type_=Float),
            bindparam(key="y_max", type_=Float),
        )
        (result,) = session.execute(
            stmt,
            {
                "districtr_map_uuid": districtr_map_uuid,
                "x_min": x_min,
                "y_min": y_min,
                "x_max": x_max,
                "y_max": y_max,
            },
        ).one()
        logger.info(
            f"Updated extent for districtr map {districtr_map_uuid} to {result}"
        )
        return

    _select_result = session.execute(
        statement=text(
            "SELECT uuid FROM districtrmap WHERE uuid = :districtr_map_uuid"
        ).bindparams(bindparam(key="districtr_map_uuid", type_=UUIDType)),
        params={"districtr_map_uuid": districtr_map_uuid},
    ).one()
    if _select_result is None:
        raise ValueError(
            f"Districtr map with UUID {districtr_map_uuid} does not exist."
        )
    stmt = text(f"""
        DO $$
        DECLARE
            rec RECORD;
            layer_extent GEOMETRY;
        BEGIN
            SELECT uuid, parent_layer
            FROM districtrmap
            WHERE uuid = '{districtr_map_uuid}'::UUID
            INTO rec;

            EXECUTE format('
                SELECT ST_Extent(ST_Transform(geometry, 4326))
                FROM gerrydb.%I',
                rec.parent_layer
            ) INTO layer_extent;

            UPDATE districtrmap
            SET extent = ARRAY[
                ST_XMin(layer_extent),
                ST_YMin(layer_extent),
                ST_XMax(layer_extent),
                ST_YMax(layer_extent)
            ]
            WHERE uuid = rec.uuid;

            EXCEPTION WHEN undefined_table THEN
                RAISE NOTICE 'Table % does not exist for layer %', rec.parent_layer, rec.name;
        END $$;
        """)
    session.execute(stmt)
