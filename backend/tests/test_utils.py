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
from app.core.security import recaptcha, auth
from pytest import MonkeyPatch, fixture
from tests.utils import fake_verify_recaptcha
from fastapi.security import SecurityScopes
from app.main import app
from app.comments.models import FullCommentFormResponse
from datetime import datetime

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
        districtr_map_slug="simple_geos",
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
        },
    )
    assert response.status_code == 201
    doc = response.json()
    return doc["document_id"]


def test_get_edges(client, session: Session, document_id):
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [["A", 1]],
            "last_updated_at": datetime.now().astimezone().isoformat(),
        },
    )
    assert response.status_code == 200

    # Test
    response = client.get(
        "/api/gerrydb/edges/simple_geos?parent_geoid=A",
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert all(d["parent_path"] == "A" for d in data)
    assert all(d["child_path"] in {"a", "e"} for d in data)


@fixture(autouse=True)
def patch_recaptcha():
    monkeypatch = MonkeyPatch()
    monkeypatch.setattr(recaptcha, "verify_recaptcha", fake_verify_recaptcha)
    yield
    monkeypatch.undo()


@fixture(autouse=True)
def override_auth_dependency():
    async def _ok_override(_scopes: SecurityScopes):
        # Return anything your app expects from a verified token
        # You can include "scope" with needed permissions if your code reads it.
        return {"sub": "test-user", "scope": "create:content read:content"}

    app.dependency_overrides[auth.verify] = _ok_override
    try:
        yield
    finally:
        app.dependency_overrides.pop(auth.verify, None)


def handle_approve_comment_entry(client, content_type: str, id: int):
    """
    Test utility to approve a comment, tag, or commenter
    """
    client.post(
        "/api/comments/admin/review",
        json={
            "content_type": content_type,
            "review_status": "APPROVED",
            "id": id,
        },
    )


def handle_full_submission_approve(client, form_response: FullCommentFormResponse):
    """
    Test utility to approve a full comment submission
    """
    if "tags" in form_response["comment"]:
        for tag in form_response["comment"]["tags"]:
            handle_approve_comment_entry(client, "tag", tag["id"])
    if (
        "commenter_id" in form_response["comment"]
        and form_response["comment"]["commenter_id"] is not None
    ):
        handle_approve_comment_entry(
            client, "commenter", form_response["comment"]["commenter_id"]
        )
    if "id" in form_response["comment"] and form_response["comment"]["id"] is not None:
        handle_approve_comment_entry(client, "comment", form_response["comment"]["id"])
