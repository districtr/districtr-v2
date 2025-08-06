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

    # chck the document out
    response = client.post(
        f"/api/document/{document_id}/checkout",
        json={
            "user_id": USER_ID,
            "password": "password",
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


def test_checkout_public_document(client, public_document):
    document_id = public_document["document_id"]
    response = client.post(
        f"/api/document/{document_id}/share",
        json={"password": "test_password", "access_type": "read"},
    )
    assert response.status_code == 200

    # Unlock with correct password
    public_id = public_document["public_id"]
    response = client.post(
        f"/api/document/{public_id}/checkout",
        json={"password": "test_password", "user_id": "test_user"},
    )
    assert response.status_code == 200

    data = response.json()
    assert data["document_id"] == document_id
    assert data["status"] == DocumentEditStatus.locked
    assert data["access"] == DocumentShareStatus.read


def test_checkout_public_document_with_read_only_access(client, public_document):
    document_id = public_document["document_id"]
    response = client.post(
        f"/api/document/{document_id}/share",
        json={"password": "test_password", "access_type": "read"},
    )
    assert response.status_code == 200

    # Unlock with wrong password
    public_id = public_document["public_id"]
    response = client.post(
        f"/api/document/{public_id}/checkout",
        json={"password": "test_password", "user_id": "test_user"},
    )
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == DocumentEditStatus.locked
    assert data["access"] == DocumentShareStatus.read


def test_checkout_public_document_that_has_not_been_shared(client, public_document):
    # Note: Not hitting share endpoint

    # Try to unlock a document that doesn't need unlocking
    public_id = public_document["public_id"]
    response = client.post(
        f"/api/document/{public_id}/checkout",
        json={"password": "any_password", "user_id": "test_user"},
    )
    assert response.status_code == 404

    data = response.json()
    assert data["detail"] == "This document has not been shared"


def test_checkout_public_document_shared_without_password(client, public_document):
    document_id = public_document["document_id"]
    response = client.post(
        f"/api/document/{document_id}/share",
        json={"password": None, "access_type": "read"},
    )
    assert response.status_code == 200

    # Try to unlock a document that doesn't need unlocking
    public_id = public_document["public_id"]
    response = client.post(
        f"/api/document/{public_id}/checkout",
        json={"password": "any_password", "user_id": "test_user"},
    )
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == DocumentEditStatus.locked
    assert data["access"] == DocumentShareStatus.read
