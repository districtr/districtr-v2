from sqlalchemy import text
from sqlalchemy import bindparam, Integer, String, Text
from sqlmodel import Session


def create_districtr_map(
    session: Session,
    name: str,
    parent_layer_name: str,
    child_layer_name: str | None = None,
    gerrydb_table_name: str | None = None,
    num_districts: int | None = None,
    tiles_s3_path: str | None = None,
):
    stmt = text("""
    SELECT * FROM create_districtr_map(
        :map_name,
        :gerrydb_table_name,
        :num_districts,
        :tiles_s3_path,
        :parent_layer_name,
        :child_layer_name
    )""").bindparams(
        bindparam(key="map_name", type_=String),
        bindparam(key="gerrydb_table_name", type_=String),
        bindparam(key="num_districts", type_=Integer),
        bindparam(key="tiles_s3_path", type_=String),
        bindparam(key="parent_layer_name", type_=String),
        bindparam(key="child_layer_name", type_=String),
    )

    (inserted_uuid,) = session.execute(
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
    return inserted_uuid


def create_shatterable_gerrydb_view(
    session: Session,
    parent_layer_name: str,
    child_layer_name: str,
    gerrydb_table_name: str,
):
    print("gerrydb_table_name", gerrydb_table_name)
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
