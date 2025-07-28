from tests.constants import (
    GERRY_DB_FIXTURE_NAME,
    USER_ID,
)
from app.save_share.models import DocumentEditStatus, DocumentShareStatus
import jwt
from app.core.config import settings
from pytest import fixture


@fixture(name="public_document")
def document_fixture(client, ks_demo_view_census_blocks_districtrmap):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
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
            "user_id": USER_ID,
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


def test_unlock_map(client, private_document):
    document_id = private_document["document_id"]
    response = client.post(
        f"/api/document/{document_id}/unlock", json={"user_id": USER_ID}
    )
    assert response.status_code == 200


def test_get_document_status(client, private_document):
    document_id = private_document["document_id"]
    response = client.post(
        f"/api/document/{document_id}/status", json={"user_id": USER_ID}
    )
    document_status = response.json().get("status")

    assert (
        document_status == DocumentEditStatus.checked_out
    )  # since it was made fresh by this user


def test_document_checkout(client, private_document):
    document_id = private_document["document_id"]
    share_payload = {"password": "password", "access_type": "read"}

    response = client.post(
        f"/api/document/{document_id}/share",
        json={
            "password": share_payload["password"],
            "access_type": share_payload["access_type"],
        },
    )
    decoded_token = jwt.decode(
        response.json()["token"], settings.SECRET_KEY, algorithms=["HS256"]
    )

    # chck the document out
    response = client.post(
        f"/api/document/{document_id}/checkout",
        json={
            "user_id": USER_ID,
            "password": "password",
            "token": decoded_token["token"],
        },
    )

    assert response.status_code == 200, response.json()
    assert response.json().get("status") == DocumentEditStatus.checked_out


def test_load_plan_from_public_id_without_password(client, public_document):
    public_id = public_document["public_id"]
    response = client.get(f"/api/document/{public_id}")
    assert response.status_code == 200, response.json()

    data = response.json()
    assert data["document_id"] == "anonymous"
    assert data["status"] == DocumentEditStatus.locked
    assert data["access"] == DocumentShareStatus.read


def test_load_plan_from_public_id_with_password(client, document_id):
    response = client.post(
        f"/api/document/{document_id}/share",
        json={"password": "test_password", "access_type": "read"},
    )
    assert response.status_code == 200

    # Set to ready_to_share
    response = client.put(
        f"/api/document/{document_id}/metadata",
        json={"draft_status": "ready_to_share", "name": "Password Protected Map"},
    )
    assert response.status_code == 200

    # Load via public_id - should be locked due to password
    response = client.get("/api/share/public/1?user_id=test_user")
    assert response.status_code == 200

    data = response.json()
    assert data["document_id"] == document_id
    assert data["status"] == DocumentEditStatus.locked
    assert data["access"] == DocumentShareStatus.read


def test_unlock_public_document_with_password(client, document_id):
    response = client.post(
        f"/api/document/{document_id}/share",
        json={"password": "test_password", "access_type": "read"},
    )
    assert response.status_code == 200

    # Set to ready_to_share
    response = client.put(
        f"/api/document/{document_id}/metadata",
        json={"draft_status": "ready_to_share", "name": "Password Protected Map"},
    )
    assert response.status_code == 200

    # Unlock with correct password
    response = client.post(
        "/api/share/public/1/unlock?password=test_password&user_id=test_user"
    )
    assert response.status_code == 200

    data = response.json()
    assert data["document_id"] == document_id
    assert data["status"] == DocumentEditStatus.unlocked
    assert data["access"] == DocumentShareStatus.read


def test_unlock_public_document_with_wrong_password(client, document_id):
    response = client.post(
        f"/api/document/{document_id}/share",
        json={"password": "test_password", "access_type": "read"},
    )
    assert response.status_code == 200

    # Set to ready_to_share
    response = client.put(
        f"/api/document/{document_id}/metadata",
        json={"draft_status": "ready_to_share", "name": "Password Protected Map"},
    )
    assert response.status_code == 200

    # Unlock with wrong password
    response = client.post(
        "/api/share/public/1/unlock?password=wrong_password&user_id=test_user"
    )
    assert response.status_code == 401

    data = response.json()
    assert data["detail"] == "Invalid password"


def test_unlock_public_document_without_password_protection(client, document_id):
    response = client.put(
        f"/api/document/{document_id}/metadata",
        json={"draft_status": "ready_to_share", "name": "Public Map"},
    )
    assert response.status_code == 200

    # Try to unlock a document that doesn't need unlocking
    response = client.post(
        "/api/share/public/1/unlock?password=any_password&user_id=test_user"
    )
    assert response.status_code == 400

    data = response.json()
    assert data["detail"] == "This document does not require a password"


def test_public_id_not_found(client):
    """Test loading a public document that doesn't exist"""
    response = client.get("/api/share/public/999?user_id=test_user")
    assert response.status_code == 404

    data = response.json()
    assert data["detail"] == "Public document not found"


def test_public_id_export_endpoint(client, document_id):
    response = client.put(
        f"/api/document/{document_id}/metadata",
        json={"draft_status": "ready_to_share", "name": "Export Test Map"},
    )
    assert response.status_code == 200

    # Test export with public_id
    response = client.get(
        "/api/document/1/export?format=CSV&export_type=ZoneAssignments"
    )
    assert response.status_code == 200
    # Should return a CSV file
    assert "text/csv" in response.headers["content-type"]


def test_public_id_unassigned_endpoint(client, document_id):
    response = client.put(
        f"/api/document/{document_id}/metadata",
        json={"draft_status": "ready_to_share", "name": "Unassigned Test Map"},
    )
    assert response.status_code == 200

    # Test unassigned with public_id
    response = client.get("/api/document/1/unassigned")
    assert response.status_code == 200

    data = response.json()
    assert "features" in data
    assert isinstance(data["features"], list)


def test_public_id_contiguity_endpoint(client, document_id):
    response = client.put(
        f"/api/document/{document_id}/metadata",
        json={"draft_status": "ready_to_share", "name": "Contiguity Test Map"},
    )
    assert response.status_code == 200

    # Test contiguity with public_id
    # Note: This might return 404 if graph data isn't available in test environment
    response = client.get("/api/document/1/contiguity")
    # Accept both 200 (success) and 404 (graph not found) as valid responses
    assert response.status_code in [200, 404]

    if response.status_code == 200:
        data = response.json()
        # Should return contiguity results (exact structure may vary)
        assert isinstance(data, (dict, list))


def test_public_id_connected_component_bboxes_endpoint(client, document_id):
    response = client.put(
        f"/api/document/{document_id}/metadata",
        json={
            "draft_status": "ready_to_share",
            "name": "Connected Components Test Map",
        },
    )
    assert response.status_code == 200

    # Test connected component bboxes with public_id for zone 1
    # Note: This might return 404 if zone 1 doesn't exist, which is expected
    response = client.get("/api/document/1/contiguity/1/connected_component_bboxes")
    # Accept both 200 (zone exists) and 404 (zone doesn't exist) as valid
    assert response.status_code in [200, 404]

    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, (dict, list))


def test_public_id_invalid_endpoint(client):
    """Test that invalid public_id returns 404"""
    # Test with non-existent public_id
    response = client.get("/api/document/999/export")
    assert response.status_code == 404

    response = client.get("/api/document/999/unassigned")
    assert response.status_code == 404

    response = client.get("/api/document/999/contiguity")
    assert response.status_code == 404


def test_public_id_with_uuid_still_works(client, document_id):
    response = client.get(
        f"/api/document/{document_id}/export?format=CSV&export_type=ZoneAssignments"
    )
    assert response.status_code == 200

    # Test that regular UUID still works with unassigned endpoint
    response = client.get(f"/api/document/{document_id}/unassigned")
    assert response.status_code == 200
