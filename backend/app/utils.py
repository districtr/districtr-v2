from sqlalchemy import text
from sqlalchemy import bindparam, Integer, String, Text
from sqlmodel import Session
from osgeo import ogr, osr

from app.models import UUIDType


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


def transform_bounding_box(bbox: list, source_epsg: str, target_epsg: str) -> list:
    """
    Transform a bounding box from one spatial reference to another.
    For use in transforming gerrydb view bboxes before loading extents to db
    """
    # Create source and target spatial references
    source_srs = osr.SpatialReference()
    source_srs.ImportFromEPSG(source_epsg)

    target_srs = osr.SpatialReference()
    target_srs.ImportFromEPSG(target_epsg)

    # Create transformation object
    transform = osr.CoordinateTransformation(source_srs, target_srs)

    # Create a polygon geometry from the bounding box
    minx, miny, maxx, maxy = bbox
    ring = ogr.Geometry(ogr.wkbLinearRing)
    ring.AddPoint(minx, miny)
    ring.AddPoint(maxx, miny)
    ring.AddPoint(maxx, maxy)
    ring.AddPoint(minx, maxy)
    ring.AddPoint(minx, miny)

    polygon = ogr.Geometry(ogr.wkbPolygon)
    polygon.AddGeometry(ring)

    # Transform the geometry
    polygon.Transform(transform)

    # Get the transformed bounding box
    transformed_ring = polygon.GetGeometryRef(0)
    transformed_bbox = [
        transformed_ring.GetX(0),
        transformed_ring.GetY(0),  # MinX, MinY
        transformed_ring.GetX(2),
        transformed_ring.GetY(2),  # MaxX, MaxY
    ]

    return transformed_bbox
