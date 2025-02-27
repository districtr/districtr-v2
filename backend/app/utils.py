from sqlalchemy import text, update
from sqlalchemy import bindparam, Integer, String, Text
from sqlalchemy.types import UUID
from sqlmodel import Session, Float, Boolean
import logging
from urllib.parse import ParseResult
import os
from app.core.config import settings
from urllib.parse import urlparse


from app.models import SummaryStatisticType, UUIDType, DistrictrMap, DistrictrMapUpdate

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def create_districtr_map(
    session: Session,
    name: str,
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
        :gerrydb_table_name,
        :num_districts,
        :tiles_s3_path,
        :parent_layer_name,
        :child_layer_name,
        :visibility
    )"""
    ).bindparams(
        bindparam(key="map_name", type_=String),
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
            "gerrydb_table_name": gerrydb_table_name,
            "num_districts": num_districts,
            "tiles_s3_path": tiles_s3_path,
            "parent_layer_name": parent_layer,
            "child_layer_name": child_layer,
            "visibility": visibility,
        },
    )
    return inserted_map_uuid  # pyright: ignore


def update_districtrmap(
    session: Session,
    gerrydb_table_name: str,
    **kwargs,
):
    """
    Update a districtr map.

    Args:
        session: The database session.
        gerrydb_table_name: The name of the gerrydb table.
        **kwargs: The fields to update.

    Returns:
        The updated districtr map.
    """
    data = DistrictrMapUpdate(gerrydb_table_name=gerrydb_table_name, **kwargs)
    update_districtrmap = data.model_dump(
        exclude_unset=True, exclude={"gerrydb_table_name"}, exclude_none=True
    )

    if not update_districtrmap.keys():
        raise KeyError("No fields to update")

    stmt = (
        update(DistrictrMap)
        .where(DistrictrMap.gerrydb_table_name == data.gerrydb_table_name)  # pyright: ignore
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


def get_available_summary_stats(session: Session, gerrydb_table_name: str):
    """
    Get the available summary statistics for a given gerrydb table.

    Args:
        session: The database session.
        gerrydb_table_name: The name of the gerrydb table.
    """
    stmt = text("SELECT * FROM get_available_summary_stats(:gerrydb_table_name)")
    return session.execute(
        stmt,
        {
            "gerrydb_table_name": gerrydb_table_name,
        },
    ).all()


def add_available_summary_stats_to_districtrmap(
    session: Session, districtr_map_uuid: str, summary_stats: list[str] | None = None
) -> list[SummaryStatisticType] | None:
    """
    Add the available summary statistics to the districtr map.

    Args:
        session: The database session.
        districtr_map_uuid: The UUID of the districtr map.
        summary_stats: The summary statistics to add.
    """
    if summary_stats is not None:
        raise NotImplementedError(
            "Manually adding summary stats to a districtr map is not yet implemented."
        )

    stmt = text(
        """
        UPDATE districtrmap
        SET available_summary_stats =
            CASE WHEN child_layer IS NOT NULL THEN
                (
                SELECT ARRAY_AGG(summary_stat) FROM get_available_summary_stats(child_layer)
                INTERSECT
                SELECT ARRAY_AGG(summary_stat) FROM get_available_summary_stats(parent_layer)
                )
            ELSE
                (SELECT ARRAY_AGG(summary_stat) FROM get_available_summary_stats(parent_layer))
            END
        WHERE uuid = :districtr_map_uuid
        RETURNING available_summary_stats
        """
    ).bindparams(
        bindparam(key="districtr_map_uuid", type_=UUIDType),
    )
    result = session.execute(
        stmt,
        {
            "districtr_map_uuid": districtr_map_uuid,
            "summary_stats": summary_stats,
        },
    )
    (available_summary_stats,) = result.one()
    logger.info(
        f"Updated available summary stats for districtr map {districtr_map_uuid} to {available_summary_stats}"
    )
    return available_summary_stats


def download_file_from_s3(s3, url: ParseResult, replace=False) -> str:
    """
    Download a file from S3 to the local volume path.

    Args:
        s3: S3 client
        url (ParseResult): URL of the file to download
        replace (bool): If True, replace the file if it already exists

    Returns the path to the downloaded file.
    """
    if not s3:
        raise ValueError("S3 client is not available")

    file_name = url.path.lstrip("/")
    logger.info("File name: %s", file_name)
    object_information = s3.head_object(Bucket=url.netloc, Key=file_name)

    if object_information["ResponseMetadata"]["HTTPStatusCode"] != 200:
        raise ValueError(
            f"GeoPackage file {file_name} not found in S3 bucket {url.netloc}"
        )

    logger.info("Downloading GerryDB view. Got response:\n%s", object_information)

    path = os.path.join(settings.VOLUME_PATH, file_name)

    if os.path.exists(path) and not replace:
        logger.info("File already exists. Skipping download.")
    else:
        logger.info("Downloading file...")
        s3.download_file(url.netloc, file_name, path)

    return path


def get_local_or_s3_path(file_path: str, replace: bool = False) -> str:
    """
    Get the local or S3 path for a file.

    Args:
        file_path (str): The path to the file.
        replace (bool): If True, replace the file if it already exists

    Returns the path to the downloaded file.
    """
    url = urlparse(file_path)
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        return download_file_from_s3(s3=s3, url=url, replace=replace)

    return file_path


def remove_file(filename: str) -> None:
    """
    Remove a file, quietly warning of failure rather than raising an Error.

    Args:
        filename (str): The name of the file to remove.
    """
    try:
        os.remove(filename)
        logger.info(f"Removed file {filename}")
    except FileNotFoundError:
        logger.warning(f"File {filename} not found")
        pass
