import pytest
import uuid
from app.cms.models import (
    CMSContentTypesEnum,
    LanguageEnum,
)


@pytest.fixture(name="tags_cms_content_id")
def mock_tags_cms_content(client, session):
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
                "districtr_map_slug": "co_districtr_view",
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
                "districtr_map_slug": "co_districtr_view",
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
                "districtr_map_slug": "co_districtr_view",
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
                "districtr_map_slug": "co_districtr_view",
            },
        ),
    ]
    return [response["id"] for response in responses]


def test_create_cms_content(client):
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
            "districtr_map_slug": "co_districtr_view",
        },
    )
    # Check that the response is correct
    assert response.status_code == 201
    assert response.json()["id"] is not None
    assert response.json()["message"] == "Content created successfully"


def test_create_cms_content_conflict(client, tags_cms_content_id):
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


def test_update_cms_content_slug_conflict(client, tags_cms_content_id):
    """Test updating a CMS content entry with a slug that conflicts with another entry"""

    update_data = {
        "content_type": CMSContentTypesEnum.tags.value,
        "content_id": tags_cms_content_id[0],
        "updates": {"slug": "test-tags", "language": LanguageEnum.ENGLISH.value},
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


def test_publish_cms_content_no_draft(client):
    """Test publishing when there's no draft content"""
    content_no_draft = client.post(
        "/api/cms/content",
        json={
            "content_type": CMSContentTypesEnum.tags.value,
            "slug": "test-tags-no-draft-2",
            "language": LanguageEnum.ENGLISH.value,
            "draft_content": None,
            "published_content": {"title": "Published Content"},
            "districtr_map_slug": "co_districtr_view",
        },
    )
    print("!!!", content_no_draft.json())
    response = client.post(
        "/api/cms/content/publish",
        json={
            "content_type": CMSContentTypesEnum.tags.value,
            "content_id": content_no_draft.json()["id"],
        },
    )

    assert response.status_code == 400
    assert "No draft content to publish" in response.json()["detail"]


def test_publish_cms_content_not_found(client):
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
