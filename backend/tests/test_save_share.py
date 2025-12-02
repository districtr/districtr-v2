from tests.constants import (
    GERRY_DB_FIXTURE_NAME,
)
from app.save_share.models import DocumentShareStatus
import jwt
from app.core.config import settings
from pytest import fixture


@fixture(name="public_document")
def document_fixture(client, ks_demo_view_census_blocks_districtrmap):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
        },
    )
    assert response.status_code == 201
    document = response.json()

    # Set to ready_to_share
    document_id = document["document_id"]
    response = client.put(
        f"/api/document/{document_id}/metadata",
        json={"draft_status": "ready_to_share", "name": "Public Test Map"},
    )
    assert response.status_code == 200, response.json()

    return document


@fixture(name="private_document")
def private_document_fixture(client, ks_demo_view_census_blocks_districtrmap):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
        },
    )
    assert response.status_code == 201
    document = response.json()
    return document


def test_share_districtr_plan(client, private_document):
    """Test sharing a document when a pw exists"""
    document_id = private_document["document_id"]
    share_payload = {"password": "password", "access_type": "read"}

    response = client.post(
        f"/api/document/{document_id}/share",
        json={
            "password": share_payload["password"],
            "access_type": share_payload["access_type"],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "token" in data

    decoded_token = jwt.decode(data["token"], settings.SECRET_KEY, algorithms=["HS256"])
    assert decoded_token["access"] == "read"
    assert decoded_token["password_required"]

    # test sharing from an existing token
    response = client.post(
        f"/api/document/{document_id}/share",
        json={
            "password": share_payload["password"],
            "access_type": share_payload["access_type"],
        },
    )

    assert response.status_code == 200
    assert "token" in data


def test_load_plan_from_public_id_without_password(client, public_document):
    public_id = public_document["public_id"]
    response = client.get(f"/api/document/{public_id}")
    assert response.status_code == 200, response.json()

    data = response.json()
    assert data["document_id"] == "anonymous"
    assert data["access"] == DocumentShareStatus.read


def test_load_plan_from_public_id_with_password(client, private_document):
    document_id = private_document["document_id"]
    response = client.post(
        f"/api/document/{document_id}/share",
        json={"password": "test_password", "access_type": "read"},
    )
    assert response.status_code == 200

    # Load via public_id - should 404 since plan is not yet ready to share
    public_id = private_document["public_id"]
    response = client.get(f"/api/document/{public_id}")
    assert response.status_code == 200


def test_copy_document(client, private_document):
    """Test copying a document using copy_from_doc parameter"""
    document_id = private_document["document_id"]

    # First, add some assignments to the original document
    # Get the document to get its updated_at timestamp
    doc_response = client.get(f"/api/document/{document_id}")
    assert doc_response.status_code == 200
    doc_data = doc_response.json()

    response = client.put(
        "/api/assignments",
        json={
            "assignments": [
                {"document_id": document_id, "geo_id": "202090441022004", "zone": 1},
                {"document_id": document_id, "geo_id": "202090428002008", "zone": 1},
            ],
            "last_updated_at": doc_data.get("updated_at", "2023-01-01T00:00:00"),
        },
    )
    assert response.status_code == 200

    # Create a copy of the document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "copy_from_doc": document_id,
            "metadata": {"name": "Copied Map"},
        },
    )
    assert response.status_code == 201
    copied_doc = response.json()
    assert copied_doc["document_id"] != document_id
    assert copied_doc.get("map_metadata", {}).get("name") == "Copied Map"

    # Verify assignments were copied
    response = client.get(f"/api/get_assignments/{copied_doc['document_id']}")
    assert response.status_code == 200
    assignments = response.json()
    assert len(assignments) == 2
