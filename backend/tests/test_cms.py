import os
import pytest
import uuid
from app.cms.models import (
    CMSContentTypesEnum,
    LanguageEnum,
)
from app.constants import GERRY_DB_SCHEMA
from sqlmodel import Session
from sqlalchemy import text
import subprocess
from tests.constants import (
    OGR2OGR_PG_CONNECTION_STRING,
    FIXTURES_PATH,
)
from app.utils import (
    create_districtr_map,
)

GERRY_DB_TOTAL_VAP_FIXTURE_NAME = "ks_demo_view_census_blocks_total_vap"


@pytest.fixture(name=GERRY_DB_TOTAL_VAP_FIXTURE_NAME)
def ks_demo_view_census_blocks_total_vap_fixture(session: Session):
    layer = GERRY_DB_TOTAL_VAP_FIXTURE_NAME
    subprocess.run(
        args=[
            "ogr2ogr",
            "-f",
            "PostgreSQL",
            OGR2OGR_PG_CONNECTION_STRING,
            os.path.join(FIXTURES_PATH, f"{layer}.geojson"),
            "-lco",
            "OVERWRITE=yes",
            "-lco",
            "GEOMETRY_NAME=geometry",
            "-nln",
            f"{GERRY_DB_SCHEMA}.{layer}",  # Forced that the layer is imported into the gerrydb schema
        ],
    )


@pytest.fixture(name="ks_demo_view_census_total_vap_blocks_districtrmap")
def ks_demo_view_census_blocks_total_vap_districtrmap_fixture(
    session: Session, ks_demo_view_census_blocks_total_vap: None
):
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
    session.execute(upsert_query, {"name": GERRY_DB_TOTAL_VAP_FIXTURE_NAME})
    create_districtr_map(
        session=session,
        name=f"Districtr map {GERRY_DB_TOTAL_VAP_FIXTURE_NAME}",
        districtr_map_slug=GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        gerrydb_table_name=GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        parent_layer=GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
    )
    session.commit()


@pytest.fixture(name="tags_cms_content_id")
def mock_tags_cms_content(client, ks_demo_view_census_total_vap_blocks_districtrmap):
    responses = [
        client.post(
            "/api/cms/content",
            json={
                "content_type": CMSContentTypesEnum.tags.value,
                "slug": "test-tags",
                "language": LanguageEnum.ENGLISH.value,
                "draft_content": {
                    "title": "test",
                    "subtitle": "",
                    "body": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "test"}],
                            }
                        ],
                    },
                },
                "published_content": None,
                "districtr_map_slug": "ks_demo_view_census_blocks_total_vap",
            },
        ),
        client.post(
            "/api/cms/content",
            json={
                "content_type": CMSContentTypesEnum.tags.value,
                "slug": "test-tags",
                "language": LanguageEnum.SPANISH.value,
                "draft_content": {
                    "title": "test",
                    "subtitle": "",
                    "body": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "test"}],
                            }
                        ],
                    },
                },
                "published_content": None,
                "districtr_map_slug": "ks_demo_view_census_blocks_total_vap",
            },
        ),
        client.post(
            "/api/cms/content",
            json={
                "content_type": CMSContentTypesEnum.tags.value,
                "slug": "test-tags2",
                "language": LanguageEnum.ENGLISH.value,
                "draft_content": {
                    "title": "test",
                    "subtitle": "",
                    "body": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "test"}],
                            }
                        ],
                    },
                },
                "published_content": None,
                "districtr_map_slug": "ks_demo_view_census_blocks_total_vap",
            },
        ),
        client.post(
            "/api/cms/content",
            json={
                "content_type": CMSContentTypesEnum.tags.value,
                "slug": "test-tags2",
                "language": LanguageEnum.SPANISH.value,
                "draft_content": {
                    "title": "test",
                    "subtitle": "",
                    "body": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "test"}],
                            }
                        ],
                    },
                },
                "published_content": None,
                "districtr_map_slug": GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
            },
        ),
    ]
    return [response.json()["id"] for response in responses]


def test_create_cms_content(client, ks_demo_view_census_total_vap_blocks_districtrmap):
    """Test creating a new CMS content entry"""
    # Mock the session.exec() result for checking existing content
    response = client.post(
        "/api/cms/content",
        json={
            "content_type": "tags",
            "slug": "test-tags-new",
            "language": "en",
            "draft_content": {
                "title": "test",
                "subtitle": "",
                "body": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "test"}],
                        }
                    ],
                },
            },
            "published_content": None,
            "districtr_map_slug": GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        },
    )
    # Check that the response is correct
    assert response.status_code == 201
    assert response.json()["id"] is not None
    assert response.json()["message"] == "Content created successfully"


def test_create_cms_content_invalid_slug_empty(
    client, ks_demo_view_census_total_vap_blocks_districtrmap
):
    """Test creating a new CMS content entry"""
    # Mock the session.exec() result for checking existing content
    response = client.post(
        "/api/cms/content",
        json={
            "content_type": "tags",
            "slug": "",  # Empty slug
            "language": "en",
            "draft_content": {
                "title": "test",
                "subtitle": "",
                "body": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "test"}],
                        }
                    ],
                },
            },
            "published_content": None,
            "districtr_map_slug": GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        },
    )
    assert response.status_code == 422


def test_create_cms_content_invalid_special_characters_slug(
    client, ks_demo_view_census_total_vap_blocks_districtrmap
):
    """Test creating a new CMS content entry"""
    # Mock the session.exec() result for checking existing content
    response = client.post(
        "/api/cms/content",
        json={
            "content_type": "tags",
            "slug": "invalid/slug$$$:)_",  # Invalid slug with special characters
            "language": "en",
            "draft_content": {
                "title": "test",
                "subtitle": "",
                "body": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "test"}],
                        }
                    ],
                },
            },
            "published_content": None,
            "districtr_map_slug": GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        },
    )
    assert response.status_code == 422


def test_create_cms_content_conflict(
    client, tags_cms_content_id, ks_demo_view_census_total_vap_blocks_districtrmap
):
    """Test creating a CMS content entry with the same slug and language"""
    content_data = {
        "content_type": CMSContentTypesEnum.tags.value,
        "slug": "test-tags",
        "language": LanguageEnum.ENGLISH.value,
        "draft_content": {
            "title": "Conflict Content",
            "description": "This should conflict",
        },
        "published_content": None,
        "districtr_map_slug": "test-map",
    }
    response = client.post("/api/cms/content", json=content_data)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_update_cms_content(client, tags_cms_content_id):
    """Test updating an existing CMS content entry"""
    update_data = {
        "content_type": "tags",
        "content_id": tags_cms_content_id[0],
        "updates": {
            "draft_content": {
                "title": "test-2",
                "subtitle": "",
                "body": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "test-2"}],
                        }
                    ],
                },
            },
        },
    }
    response = client.patch("/api/cms/content", json=update_data)
    assert response.status_code == 200
    assert response.json()["message"] == "Content updated successfully"


def test_update_cms_content_not_found(client, tags_cms_content_id):
    """Test updating a non-existent CMS content entry"""
    fake_id = str(uuid.uuid4())
    update_data = {
        "content_type": CMSContentTypesEnum.tags.value,
        "content_id": fake_id,
        "updates": {
            "draft_content": {
                "title": "Updated Content",
                "description": "Updated description",
            }
        },
    }
    response = client.patch("/api/cms/content", json=update_data)
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


def test_update_cms_content_slug_conflict(
    client, tags_cms_content_id, ks_demo_view_census_total_vap_blocks_districtrmap
):
    """Test updating a CMS content entry with a slug that conflicts with another entry"""
    client.post(
        "/api/cms/content",
        json={
            "content_type": CMSContentTypesEnum.tags.value,
            "slug": "test-tags-conflict",
            "language": LanguageEnum.ENGLISH.value,
        },
    )

    update_data = {
        "content_type": CMSContentTypesEnum.tags.value,
        "content_id": tags_cms_content_id[0],
        "updates": {
            "slug": "test-tags-conflict",
            "language": LanguageEnum.ENGLISH.value,
        },
    }
    response = client.patch("/api/cms/content", json=update_data)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_publish_cms_content(client, tags_cms_content_id):
    """Test publishing draft content"""
    response = client.post(
        "/api/cms/content/publish",
        json={
            "content_type": CMSContentTypesEnum.tags.value,
            "content_id": tags_cms_content_id[0],
        },
    )
    assert response.status_code == 200


def test_publish_cms_content_no_draft(
    client, ks_demo_view_census_total_vap_blocks_districtrmap
):
    """Test publishing when there's no draft content"""
    content_no_draft = client.post(
        "/api/cms/content",
        json={
            "content_type": CMSContentTypesEnum.tags.value,
            "slug": "test-tags-no-draft-2",
            "language": LanguageEnum.ENGLISH.value,
            "draft_content": None,
            "published_content": {"title": "Published Content"},
            "districtr_map_slug": GERRY_DB_TOTAL_VAP_FIXTURE_NAME,
        },
    )
    response = client.post(
        "/api/cms/content/publish",
        json={
            "content_type": CMSContentTypesEnum.tags.value,
            "content_id": content_no_draft.json()["id"],
        },
    )

    assert response.status_code == 400
    assert "No draft content to publish" in response.json()["detail"]


def test_publish_cms_content_not_found(
    client, ks_demo_view_census_total_vap_blocks_districtrmap
):
    """Test publishing a non-existent CMS content entry"""
    # Set up the mock session to return None, simulating content not found
    fake_id = str(uuid.uuid4())
    response = client.post(
        "/api/cms/content/publish",
        json={"content_type": CMSContentTypesEnum.tags.value, "content_id": fake_id},
    )
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


def test_delete_cms_content(client, tags_cms_content_id):
    """Test deleting a CMS content entry"""
    # Create a mock content object for the session to return
    response = client.post(
        "/api/cms/content/delete",
        json={
            "content_type": CMSContentTypesEnum.tags.value,
            "content_id": tags_cms_content_id[-1],
        },
    )
    assert response.status_code == 204


def test_delete_cms_content_not_found(client):
    """Test deleting a non-existent CMS content entry"""
    # Set up the mock session to return None, simulating content Not Found
    fake_id = str(uuid.uuid4())
    response = client.post(
        "/api/cms/content/delete",
        json={"content_type": CMSContentTypesEnum.tags.value, "content_id": fake_id},
    )
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


def test_list_cms_content(client, tags_cms_content_id):
    """Test listing CMS content"""
    # Create mock content items
    response = client.get("/api/cms/content/tags/list")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_list_cms_content_with_language(client, tags_cms_content_id):
    """Test listing CMS content with language filter"""
    response = client.get("/api/cms/content/tags/list?language=en")
    data = response.json()
    assert response.status_code == 200
    assert isinstance(data, list)
    languages = set(item["language"] for item in data)
    assert len(languages) == 1
    assert LanguageEnum.ENGLISH.value in languages


def test_list_cms_content_pagination(client, tags_cms_content_id):
    """Test listing CMS content with pagination"""
    response = client.get("/api/cms/content/tags/list?limit=2")
    assert response.status_code == 200
    results = response.json()
    assert isinstance(results, list)
    assert len(results) == 2


def test_get_cms_content_by_slug(client, tags_cms_content_id):
    """Test getting CMS content by slug"""
    # Create a mock model object
    response = client.get("/api/cms/content/tags/slug/test-tags")
    assert response.status_code == 200
    assert "content" in response.json()
    assert "available_languages" in response.json()


def test_get_cms_content_by_slug_with_language(client, tags_cms_content_id):
    """Test getting CMS content by slug with language preference"""
    # Create mock content items for different languages
    response = client.get("/api/cms/content/tags/slug/test-tags?language=es")
    assert response.status_code == 200


def test_get_cms_content_by_slug_not_found(client):
    """Test getting CMS content with a non-existent slug"""
    response = client.get("/api/cms/content/tags/slug/non-existent-slug")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


def test_get_cms_content_fallback_language(client, tags_cms_content_id):
    """Test language fallback when requested language is not available"""
    # Request with Chinese language, should get English as fallback
    response = client.get("/api/cms/content/tags/slug/test-tags?language=zh")
    assert response.status_code == 200
