from sqlalchemy import text, update
from sqlalchemy import bindparam, Integer, String, Text
from sqlalchemy.types import UUID
from sqlmodel import Session, Float, Boolean
import logging
import bcrypt
from app.constants import GERRY_DB_SCHEMA


from app.models import UUIDType, DistrictrMap, DistrictrMapUpdate

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_districtr_map(
    session: Session,
    name: str,
    districtr_map_slug: str,
    parent_layer: str,
    child_layer: str | None = None,
    gerrydb_table_name: str | None = None,
    num_districts: int | None = None,
    tiles_s3_path: str | None = None,
    visibility: bool = True,
) -> str:
    """
    Create a new districtr map.

    Args:
        session: The database session.
        name: The name of the map.
        districtr_map_slug: The slug of the districtr map.
        parent_layer_name: The name of the parent layer.
        child_layer_name: The name of the child layer.
        gerrydb_table_name: The name of the gerrydb table.
        num_districts: The number of districts.
        tiles_s3_path: The S3 path to the tiles.
        visibility: The visibility of the map.

    Returns:
        The UUID of the inserted map.
    """
    stmt = text(
        """
    SELECT *
    FROM create_districtr_map(
        :map_name,
        :districtr_map_slug,
        :gerrydb_table_name,
        :num_districts,
        :tiles_s3_path,
        :parent_layer_name,
        :child_layer_name,
        :visibility
    )"""
    ).bindparams(
        bindparam(key="map_name", type_=String),
        bindparam(key="districtr_map_slug", type_=String),
        bindparam(key="gerrydb_table_name", type_=String),
        bindparam(key="num_districts", type_=Integer),
        bindparam(key="tiles_s3_path", type_=String),
        bindparam(key="parent_layer_name", type_=String),
        bindparam(key="child_layer_name", type_=String),
        bindparam(key="visibility", type_=Boolean),
    )

    (inserted_map_uuid,) = session.execute(
        stmt,
        {
            "map_name": name,
            "districtr_map_slug": districtr_map_slug,
            "gerrydb_table_name": gerrydb_table_name,
            "num_districts": num_districts,
            "tiles_s3_path": tiles_s3_path,
            "parent_layer_name": parent_layer,
            "child_layer_name": child_layer,
            "visibility": visibility,
        },
    )
    return inserted_map_uuid[0]  # pyright: ignore


def update_districtrmap(
    session: Session,
    districtr_map_slug: str,
    **kwargs,
):
    """
    Update a districtr map.

    Args:
        session: The database session.
        districtr_map_slug: The name of the gerrydb table.
        **kwargs: The fields to update.

    Returns:
        The updated districtr map.
    """
    data = DistrictrMapUpdate(districtr_map_slug=districtr_map_slug, **kwargs)
    update_districtrmap = data.model_dump(
        exclude_unset=True, exclude={"districtr_map_slug"}, exclude_none=True
    )

    if not update_districtrmap.keys():
        raise KeyError("No fields to update")

    stmt = (
        update(DistrictrMap)
        .where(DistrictrMap.districtr_map_slug == data.districtr_map_slug)  # pyright: ignore
        .values(update_districtrmap)
        .returning(DistrictrMap)
    )
    (updated_districtrmap,) = session.execute(stmt).one()

    return updated_districtrmap


def create_shatterable_gerrydb_view(
    session: Session,
    parent_layer: str,
    child_layer: str,
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
            "parent_layer_name": parent_layer,
            "child_layer_name": child_layer,
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
    stmt = text(
        f"""
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
                SELECT ST_Transform(
                    ST_SetSRID(
                        ST_Extent(
                            geometry
                        ),
                        (SELECT ST_SRID(geometry) FROM gerrydb.%I WHERE geometry IS NOT NULL LIMIT 1)
                    ),
                    4326
                )
                FROM gerrydb.%I',
                rec.parent_layer,
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
        """
    )
    session.execute(stmt)


def _cleanup_expired_locks(session: Session, hours: int) -> list[str] | None:
    """
    Delete expired locks from the database.

    Args:
        hours (int): The number of hours to keep locks.

    Returns:
        list[str]: A list of document IDs that had their locks deleted.

    Note:
    This feels like a DB concern and could be implemented with pg_cron.
    Did a brief spike trying to get pg_cron set up. Definitely a bit of a hassle
    so this will work for now.
    """
    stmt = text("DELETE FROM locks WHERE created_at < NOW() - INTERVAL :n_hours HOUR")
    try:
        stmt = text(
            """DELETE FROM document.map_document_user_session
            WHERE updated_at < NOW() - make_interval(hours => :n_hours)
            RETURNING document_id"""
        )

        result = session.execute(stmt, {"n_hours": hours}).scalars()
        locks = list(result)
        session.commit()
        logger.info(
            f"Deleted {len(locks)} expired locks: [{' '.join(map(str, locks))}]"
        )
        return locks
    except Exception as e:
        session.rollback()
        logger.error(f"Error deleting expired locks: {e}")


def _remove_all_locks(session: Session) -> list[str] | None:
    """
    Delete all locks from the database.

    Args:
        session (Session): The database session.

    Returns:
        list[str]: A list of document IDs that had their locks deleted.
    """
    stmt = text("DELETE FROM locks")
    try:
        stmt = text(
            """DELETE FROM document.map_document_user_session
            RETURNING document_id"""
        )

        result = session.execute(stmt).scalars()
        locks = list(result)
        session.commit()
        logger.info(f"Deleted {len(locks)} locks: [{' '.join(map(str, locks))}]")
        return locks
    except Exception as e:
        session.rollback()
        logger.error(f"Error deleting all locks: {e}")


def create_spatial_index(
    session: Session,
    table_name: str,
    schema: str = GERRY_DB_SCHEMA,
    geometry: str = "geometry",
    autocommit: bool = False,
):
    """
    Create a spatial index on the specified table.

    Args:
        session (Session): The database session.
        table_name (str): The name of the table to create the index on.
    """
    session.execute(
        text(f"CREATE INDEX ON {GERRY_DB_SCHEMA}.{table_name} USING GIST ({geometry})"),
    )
    if autocommit:
        session.commit()
