import pytest
from app.utils import (
    add_districtr_map_to_map_group,
    create_districtr_map,
    create_map_group,
    create_shatterable_gerrydb_view,
    create_parent_child_edges,
    add_extent_to_districtrmap,
    update_districtrmap,
)
from sqlmodel import Session
import subprocess
from app.constants import GERRY_DB_SCHEMA
from app.models import DistrictrMap
from tests.constants import OGR2OGR_PG_CONNECTION_STRING, FIXTURES_PATH
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


GERRY_DB_TOTPOP_FIXTURE_NAME = "ks_demo_view_census_blocks_summary_stats"


@pytest.fixture(name=GERRY_DB_TOTPOP_FIXTURE_NAME)
def ks_demo_view_census_blocks_summary_stats(session: Session):
    layer = GERRY_DB_TOTPOP_FIXTURE_NAME
    result = subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
            FIXTURES_PATH / "gerrydb" / f"{layer}.geojson",
            "-lco",
            "OVERWRITE=yes",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )

    upsert_query = text(
        """
        INSERT INTO gerrydbtable (uuid, name, updated_at)
        VALUES (gen_random_uuid(), :name, now())
        ON CONFLICT (name)
        DO UPDATE SET
            updated_at = now()
    """
    )

    session.begin()
    session.execute(upsert_query, {"name": GERRY_DB_TOTPOP_FIXTURE_NAME})

    if result.returncode != 0:
        print(f"ogr2ogr failed. Got {result}")
        raise ValueError(f"ogr2ogr failed with return code {result.returncode}")


# FOR THE TESTS BELOW I NEED TO ADD ACTUAL ASSERTIONS


def test_create_districtr_map(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    _ = create_districtr_map(
        session,
        name="Simple shatterable layer",
        districtr_map_slug="simple_geos_test",
        gerrydb_table_name="simple_geos_test",
        num_districts=10,
        tiles_s3_path="tilesets/simple_shatterable_layer.pmtiles",
        parent_layer="simple_parent_geos",
        child_layer="simple_child_geos",
    )
    session.commit()


def test_create_districtr_map_some_nulls(session: Session, simple_parent_geos_gerrydb):
    # This is also an example of a districtr map before other set-up operations
    # are performed, such as creating a tileset and a shatterable view
    _ = create_districtr_map(
        session,
        name="Simple non-shatterable layer",
        districtr_map_slug="simple_parent_geos_some_nulls",
        gerrydb_table_name="simple_parent_geos_some_nulls",
        parent_layer="simple_parent_geos",
    )
    session.commit()


@pytest.fixture(name="simple_parent_geos_districtrmap")
def simple_parent_geos_districtrmap_fixture(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    gerrydb_name = "simple_geos_test"
    _ = create_districtr_map(
        session,
        name="Simple shatterable layer",
        districtr_map_slug=gerrydb_name,
        gerrydb_table_name=gerrydb_name,
        num_districts=10,
        tiles_s3_path="tilesets/simple_shatterable_layer.pmtiles",
        parent_layer="simple_parent_geos",
        child_layer="simple_child_geos",
        visibility=True,
    )
    session.commit()
    return gerrydb_name


def test_update_districtr_map(session: Session, simple_parent_geos_districtrmap):
    result = update_districtrmap(
        session=session,
        districtr_map_slug=simple_parent_geos_districtrmap,
        gerrydb_table_name=simple_parent_geos_districtrmap,
        visible=False,
    )
    session.commit()
    districtr_map = DistrictrMap.model_validate(result)
    assert not districtr_map.visible


def test_create_map_group(session: Session):
    map_group_slug = "testgroup"
    create_map_group(
        session=session, group_name="Test Group", slug=map_group_slug, autocommit=True
    )

    result = session.execute(
        text("select count(*) from map_group where slug = :map_group_slug"),
        params={"map_group_slug": map_group_slug},
    ).scalar()

    assert result == 1


@pytest.fixture(name="map_group_slug")
def map_group_fixture(session: Session):
    map_group_slug = "testgroup"
    create_map_group(
        session=session, group_name="Test Group", slug=map_group_slug, autocommit=True
    )

    return map_group_slug


def test_create_districtr_map_in_group(
    session: Session, map_group_slug, simple_parent_geos_gerrydb: None
):
    uuid = create_districtr_map(
        session,
        name="Simple shatterable layer",
        districtr_map_slug="simple_geos_test",
        gerrydb_table_name="simple_geos_test",
        num_districts=10,
        tiles_s3_path="tilesets/simple_shatterable_layer.pmtiles",
        parent_layer="simple_parent_geos",
        group_slug=map_group_slug,
    )
    assert uuid


def test_add_districtr_map_to_nonexistent_group(
    session: Session, simple_parent_geos_gerrydb: None
):
    with pytest.raises(IntegrityError):
        create_districtr_map(
            session,
            name="Simple shatterable layer",
            districtr_map_slug="simple_geos_test",
            gerrydb_table_name="simple_geos_test",
            num_districts=10,
            tiles_s3_path="tilesets/simple_shatterable_layer.pmtiles",
            parent_layer="simple_parent_geos",
            group_slug="thisgroupdoesntexist",
        )


def test_add_extent_to_districtrmap(session: Session, simple_parent_geos_gerrydb):
    inserted_districtr_map = create_districtr_map(
        session,
        name="Simple non-shatterable layer 2",
        districtr_map_slug="simple_parent_geos_some_nulls2",
        gerrydb_table_name="simple_parent_geos_some_nulls2",
        parent_layer="simple_parent_geos",
    )
    add_extent_to_districtrmap(
        session=session, districtr_map_uuid=inserted_districtr_map
    )


@pytest.fixture
def districtr_map_in_group(
    session: Session, map_group_slug, simple_parent_geos_gerrydb: None
):
    uuid = create_districtr_map(
        session,
        name="Simple shatterable layer",
        districtr_map_slug="simple_geos_test",
        gerrydb_table_name="simple_geos_test",
        num_districts=10,
        tiles_s3_path="tilesets/simple_shatterable_layer.pmtiles",
        parent_layer="simple_parent_geos",
        group_slug=map_group_slug,
    )
    assert uuid
    return uuid


@pytest.fixture(name="second_map_group_slug")
def map_group_fixture2(session: Session):
    map_group_slug = "testgroup_two"
    create_map_group(
        session=session,
        group_name="Test Group Two",
        slug=map_group_slug,
        autocommit=True,
    )

    return map_group_slug


def test_add_districtr_map_already_in_group_to_group(
    session: Session, districtr_map_in_group: str, second_map_group_slug: str
):
    add_districtr_map_to_map_group(
        session=session,
        districtr_map_slug="simple_geos_test",
        group_slug=second_map_group_slug,
    )

    result = session.execute(
        text(
            "select count(*) from districtrmaps_to_groups where districtrmap_uuid = :map_uuid"
        ),
        params={"map_uuid": districtr_map_in_group},
    ).scalar()

    assert result == 2


def test_add_extent_to_districtrmap_manual_bounds(
    session: Session, simple_parent_geos_gerrydb
):
    inserted_districtr_map = create_districtr_map(
        session,
        name="Simple non-shatterable layer 2",
        districtr_map_slug="simple_parent_geos_some_nulls2",
        gerrydb_table_name="simple_parent_geos_some_nulls2",
        parent_layer="simple_parent_geos",
    )
    add_extent_to_districtrmap(
        session=session,
        districtr_map_uuid=inserted_districtr_map,
        bounds=[-109.06, 36.99, -102.04, 41.00],
    )


def test_create_shatterable_gerrydb_view(
    session: Session, simple_parent_geos_gerrydb, simple_child_geos_gerrydb
):
    create_shatterable_gerrydb_view(
        session,
        parent_layer="simple_parent_geos",
        child_layer="simple_child_geos",
        gerrydb_table_name="simple_geos_test",
    )
    session.commit()


def test_create_parent_child_edges(
    session: Session,
    simple_shatterable_districtr_map_no_edges_yet: str,
    gerrydb_simple_geos_view,
):
    create_parent_child_edges(
        session=session,
        districtr_map_uuid=simple_shatterable_districtr_map_no_edges_yet,
    )
    session.commit()


@pytest.fixture(name="document_id")
def document_id_fixture(
    client, session: Session, simple_shatterable_districtr_map, gerrydb_simple_geos_view
):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": "simple_geos",
            "user_id": "b097794f-8eba-4892-84b5-ad0dd5931795",
        },
    )
    assert response.status_code == 201
    doc = response.json()
    return doc["document_id"]


def test_shattering(client, session: Session, document_id):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [{"document_id": document_id, "geo_id": "A", "zone": 1}],
            "updated_at": "2023-10-01T00:00:00Z",
            "user_id": "b097794f-8eba-4892-84b5-ad0dd5931795",
        },
    )
    assert response.status_code == 200

    # Test
    response = client.patch(
        f"/api/update_assignments/{document_id}/shatter_parents",
        json={"geoids": ["A"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["parents"]["geoids"]) == 1
    assert data["parents"]["geoids"][0] == "A"
    assert len(data["children"]) == 2
    assert len({d["document_id"] for d in data["children"]}) == 1
    assert {d["geo_id"] for d in data["children"]} == {"a", "e"}
    assert all(d["zone"] == 1 for d in data["children"])


def test_unshatter_process(client, document_id):
    response = client.patch(
        "/api/update_assignments",
        json={
            "assignments": [{"document_id": document_id, "geo_id": "A", "zone": 1}],
            "updated_at": "2023-10-01T00:00:00Z",
            "user_id": "b097794f-8eba-4892-84b5-ad0dd5931795",
        },
    )

    # Test
    response = client.patch(
        f"/api/update_assignments/{document_id}/shatter_parents",
        json={"geoids": ["A"]},
    )
    assignments_response = client.get(f"/api/get_assignments/{document_id}")
    assignments_data = assignments_response.json()
    assert len(assignments_data) == 2
    # Unshatter
    response = client.patch(
        f"/api/update_assignments/{document_id}/unshatter_parents",
        json={"geoids": ["A"], "zone": 1},
    )
    assert response.status_code == 200
    data = response.json()
    # Verify the response contains the expected data
    assert "geoids" in data
    assert len(data["geoids"]) == 1
    # Confirm assignments are now length 1
    assignments_response = client.get(f"/api/get_assignments/{document_id}")
    assignments_data = assignments_response.json()
    assert len(assignments_data) == 1
