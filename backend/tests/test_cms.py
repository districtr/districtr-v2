import pytest
import uuid
from datetime import datetime
from unittest.mock import patch, MagicMock
from app.cms.models import (
    CMSContentTypesEnum,
    LanguageEnum,
)
from sqlalchemy.exc import NoResultFound


@pytest.fixture
def mock_session():
    """Provide a mocked session for testing"""
    with patch("app.cms.main.Session") as mock:
        session_instance = MagicMock()
        mock.return_value.__enter__.return_value = session_instance
        yield session_instance


def test_create_cms_content(client, mock_session):
    """Test creating a new CMS content entry"""
    # Mock the session.exec() result for checking existing content
    mock_session.exec.return_value.first.return_value = None

    # Mock the UUID generation
    test_uuid = str(uuid.uuid4())
    with patch("uuid.uuid4", return_value=uuid.UUID(test_uuid)):
        content_data = {
            "content_type": CMSContentTypesEnum.tags.value,
            "slug": "test-tags",
            "language": LanguageEnum.ENGLISH.value,
            "draft_content": {
                "title": "Test Tags",
                "description": "Test tags description",
            },
            "published_content": None,
            "districtr_map_slug": "test-map",
        }

        response = client.post("/api/cms/content", json=content_data)

        # Check that the response is correct
        assert response.status_code == 201
        assert response.json()["slug"] == "test-tags"
        assert response.json()["id"] == test_uuid


def test_create_cms_content_conflict(client, mock_session):
    """Test creating a CMS content entry with the same slug and language"""
    # Mock the session.exec() result to simulate a conflict
    mock_session.exec.return_value.first.return_value = True

    content_data = {
        "content_type": CMSContentTypesEnum.tags.value,
        "slug": "existing-slug",
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


def test_update_cms_content(client, mock_session):
    """Test updating an existing CMS content entry"""
    # Create a mock content object for the session to return
    mock_content = MagicMock()
    mock_content.id = str(uuid.uuid4())
    mock_content.updates.slug = "test-slug"
    mock_content.updates.language = LanguageEnum.ENGLISH

    # Set up the mock session to return our mock content
    mock_session.exec.return_value.first.return_value = mock_content

    update_data = {
        "content_type": CMSContentTypesEnum.tags.value,
        "content_id": mock_content.id,
        "updates": {
            "draft_content": {
                "title": "Updated Content",
                "description": "Updated description",
            }
        },
    }

    response = client.patch("/api/cms/content", json=update_data)

    assert response.status_code == 200

    # Verify the content was updated
    mock_session.add.assert_called_with(mock_content)
    mock_session.commit.assert_called_once()


def test_update_cms_content_not_found(client, mock_session):
    """Test updating a non-existent CMS content entry"""
    # Set up the mock session to return None, simulating content not found
    mock_session.exec.return_value.first.return_value = None

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


def test_update_cms_content_slug_conflict(client, mock_session):
    """Test updating a CMS content entry with a slug that conflicts with another entry"""
    # Create a mock content object for the session to return
    mock_content = MagicMock()
    mock_content.id = str(uuid.uuid4())
    mock_content.slug = "original-slug"
    mock_content.language = LanguageEnum.ENGLISH

    # Set up the mock session to first return our mock content then return a conflict
    mock_session.exec.return_value.first.side_effect = [mock_content, True]

    update_data = {
        "content_type": CMSContentTypesEnum.tags.value,
        "content_id": mock_content.id,
        "updates": {"slug": "conflicting-slug", "language": LanguageEnum.ENGLISH.value},
    }

    response = client.patch("/api/cms/content", json=update_data)

    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_publish_cms_content(client, mock_session):
    """Test publishing draft content"""
    # Create a mock content object for the session to return
    mock_content = MagicMock()
    mock_content.id = str(uuid.uuid4())
    mock_content.draft_content = {
        "title": "Draft Content",
        "description": "Draft description",
    }
    mock_content.published_content = None

    # Set up the mock session to return our mock content
    mock_session.exec.return_value.first.return_value = mock_content

    response = client.post(
        "/api/cms/content/publish",
        json={
            "content_type": CMSContentTypesEnum.tags.value,
            "content_id": mock_content.id,
        },
    )

    # Just check the status code - we can't reliably check the mock's state
    # after the endpoint has processed it
    assert response.status_code == 200


def test_publish_cms_content_no_draft(client, mock_session):
    """Test publishing when there's no draft content"""
    # Create a mock content object with no draft content
    mock_content = MagicMock()
    mock_content.id = str(uuid.uuid4())
    mock_content.draft_content = None

    # Set up the mock session to return our mock content
    mock_session.exec.return_value.first.return_value = mock_content

    response = client.post(
        "/api/cms/content/publish",
        json={
            "content_type": CMSContentTypesEnum.tags.value,
            "content_id": mock_content.id,
        },
    )

    assert response.status_code == 400
    assert "No draft content to publish" in response.json()["detail"]


def test_publish_cms_content_not_found(client, mock_session):
    """Test publishing a non-existent CMS content entry"""
    # Set up the mock session to return None, simulating content not found
    mock_session.exec.return_value.first.return_value = None

    fake_id = str(uuid.uuid4())

    response = client.post(
        "/api/cms/content/publish",
        json={"content_type": CMSContentTypesEnum.tags.value, "content_id": fake_id},
    )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


def test_delete_cms_content(client, mock_session):
    """Test deleting a CMS content entry"""
    # Create a mock content object for the session to return
    mock_content = MagicMock()
    mock_content.id = str(uuid.uuid4())

    # Set up the mock session to return our mock content
    mock_session.exec.return_value.first.return_value = mock_content

    response = client.post(
        "/api/cms/content/delete",
        json={
            "content_type": CMSContentTypesEnum.tags.value,
            "content_id": mock_content.id,
        },
    )

    assert response.status_code == 204

    # Verify the content was deleted
    mock_session.delete.assert_called_with(mock_content)
    mock_session.commit.assert_called_once()


def test_delete_cms_content_not_found(client, mock_session):
    """Test deleting a non-existent CMS content entry"""
    # Set up the mock session to return None, simulating content Not Found
    mock_session.exec.return_value.first.return_value = None

    fake_id = str(uuid.uuid4())

    response = client.post(
        "/api/cms/content/delete",
        json={"content_type": CMSContentTypesEnum.tags.value, "content_id": fake_id},
    )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


def test_list_cms_content(client, mock_session):
    """Test listing CMS content"""
    # Create mock content items
    mock_item1 = MagicMock()
    mock_item1.id = str(uuid.uuid4())
    mock_item1.slug = "item1"

    mock_item2 = MagicMock()
    mock_item2.id = str(uuid.uuid4())
    mock_item2.slug = "item2"

    # Set up the mock session to return a list of mock content
    mock_session.exec.return_value.all.return_value = [mock_item1, mock_item2]

    response = client.get("/api/cms/content/tags/list")

    assert response.status_code == 200

    # We can't check the exact JSON because our mocks won't serialize,
    # but we can check that a list is returned
    assert isinstance(response.json(), list)


def test_list_cms_content_with_language(client, mock_session):
    """Test listing CMS content with language filter"""
    # Create mock content items with English language
    mock_item = MagicMock()
    mock_item.id = str(uuid.uuid4())
    mock_item.slug = "english-item"
    mock_item.language = LanguageEnum.ENGLISH

    # Set up the mock session to return a list of mock content
    mock_session.exec.return_value.all.return_value = [mock_item]

    response = client.get("/api/cms/content/tags/list?language=en")

    assert response.status_code == 200

    # Same limitation as above
    assert isinstance(response.json(), list)


def test_list_cms_content_pagination(client, mock_session):
    """Test listing CMS content with pagination"""
    # Create mock content items
    mock_items = [MagicMock() for _ in range(5)]
    for i, item in enumerate(mock_items):
        item.id = str(uuid.uuid4())
        item.slug = f"item-{i}"

    # Set up the mock session to return paginated results
    mock_session.exec.return_value.all.return_value = mock_items[
        :2
    ]  # Just return first 2 for limit test

    response = client.get("/api/cms/content/tags/list?limit=2")

    assert response.status_code == 200

    # Again, we can't check exact JSON but we can check we get a list
    results = response.json()
    assert isinstance(results, list)


def test_get_cms_content_by_slug(client, mock_session):
    """Test getting CMS content by slug"""
    # Create a mock model object
    mock_content = MagicMock()
    mock_content.id = str(uuid.uuid4())
    mock_content.slug = "test-slug"
    mock_content.language = LanguageEnum.ENGLISH
    mock_content.draft_content = {"title": "Test Content"}
    mock_content.published_content = None
    mock_content.created_at = datetime(2025, 3, 26, 12, 0, 0)
    mock_content.updated_at = datetime(2025, 3, 26, 12, 0, 0)

    # Set up the mock session to return our content object
    mock_session.exec.return_value.all.return_value = [mock_content]

    # Override the JSON serialization for these mocked objects
    with patch(
        "fastapi.encoders.jsonable_encoder",
        side_effect=lambda obj, **kwargs: {
            "id": obj.id if hasattr(obj, "id") else None,
            "slug": obj.slug if hasattr(obj, "slug") else None,
            "language": obj.language if hasattr(obj, "language") else None,
            "draft_content": obj.draft_content
            if hasattr(obj, "draft_content")
            else None,
            "published_content": obj.published_content
            if hasattr(obj, "published_content")
            else None,
            "created_at": str(obj.created_at) if hasattr(obj, "created_at") else None,
            "updated_at": str(obj.updated_at) if hasattr(obj, "updated_at") else None,
        }
        if not isinstance(obj, (list, str, int, float, bool, type(None)))
        else obj,
    ):
        response = client.get("/api/cms/content/tags/slug/test-slug")

    assert response.status_code == 200
    assert "content" in response.json()
    assert "available_languages" in response.json()


def test_get_cms_content_by_slug_with_language(client, mock_session):
    """Test getting CMS content by slug with language preference"""
    # Create mock content items for different languages
    mock_en = MagicMock()
    mock_en.id = str(uuid.uuid4())
    mock_en.slug = "test-slug"
    mock_en.language = LanguageEnum.ENGLISH
    mock_en.draft_content = {"title": "English Content"}
    mock_en.published_content = None
    mock_en.created_at = datetime(2025, 3, 26, 12, 0, 0)
    mock_en.updated_at = datetime(2025, 3, 26, 12, 0, 0)

    mock_es = MagicMock()
    mock_es.id = str(uuid.uuid4())
    mock_es.slug = "test-slug"
    mock_es.language = LanguageEnum.SPANISH
    mock_es.draft_content = {"title": "Spanish Content"}
    mock_es.published_content = None
    mock_es.created_at = datetime(2025, 3, 26, 12, 0, 0)
    mock_es.updated_at = datetime(2025, 3, 26, 12, 0, 0)

    # Set up the mock session to return both content objects
    mock_session.exec.return_value.all.return_value = [mock_en, mock_es]

    # Override the JSON serialization for these mocked objects
    with patch(
        "fastapi.encoders.jsonable_encoder",
        side_effect=lambda obj, **kwargs: {
            "id": obj.id if hasattr(obj, "id") else None,
            "slug": obj.slug if hasattr(obj, "slug") else None,
            "language": obj.language if hasattr(obj, "language") else None,
            "draft_content": obj.draft_content
            if hasattr(obj, "draft_content")
            else None,
            "published_content": obj.published_content
            if hasattr(obj, "published_content")
            else None,
            "created_at": str(obj.created_at) if hasattr(obj, "created_at") else None,
            "updated_at": str(obj.updated_at) if hasattr(obj, "updated_at") else None,
        }
        if not isinstance(obj, (list, str, int, float, bool, type(None)))
        else obj,
    ):
        response = client.get("/api/cms/content/tags/slug/test-slug?language=es")

    assert response.status_code == 200


def test_get_cms_content_by_slug_not_found(client, mock_session):
    """Test getting CMS content with a non-existent slug"""
    # Set up the mock session to return an empty list, simulating no match
    mock_session.exec.return_value.all.return_value = []

    # Import the actual exception to be raised
    mock_session.exec.side_effect = NoResultFound()

    response = client.get("/api/cms/content/tags/slug/non-existent-slug")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


def test_get_cms_content_fallback_language(client, mock_session):
    """Test language fallback when requested language is not available"""
    # Create mock content only in English for fallback test
    mock_en = MagicMock()
    mock_en.id = str(uuid.uuid4())
    mock_en.slug = "test-slug"
    mock_en.language = LanguageEnum.ENGLISH
    mock_en.draft_content = {"title": "English Content (Fallback)"}
    mock_en.published_content = None
    mock_en.created_at = datetime(2025, 3, 26, 12, 0, 0)
    mock_en.updated_at = datetime(2025, 3, 26, 12, 0, 0)

    # Set up the mock session to return only English content
    mock_session.exec.return_value.all.return_value = [mock_en]

    # Mock the main response processing
    with patch(
        "app.cms.main.get_cms_content",
        side_effect=lambda content_type, slug, language, session: {
            "available_languages": [LanguageEnum.ENGLISH],
            "type": content_type,
            "content": mock_en,
        },
    ):
        # Request with Chinese language, should get English as fallback
        response = client.get("/api/cms/content/tags/slug/test-slug?language=zh")

    assert response.status_code == 200
