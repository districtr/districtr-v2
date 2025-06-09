from tests.constants import (
    GERRY_DB_FIXTURE_NAME,
    USER_ID,
)
from app.save_share.models import DocumentEditStatus, DocumentShareStatus
import jwt
from app.core.config import settings
from fastapi import Form


def test_share_districtr_plan(client, document_id):
    """Test sharing a document when a pw exists"""
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


def test_unlock_map(client, document_id):
    # create document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json().get("document_id")
    # unlock document
    response = client.post(
        f"/api/document/{document_id}/unlock", json={"user_id": USER_ID}
    )
    assert response.status_code == 200


def test_get_document_status(client, document_id):
    # create document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json().get("document_id")

    # check doc status
    response = client.post(
        f"/api/document/{document_id}/status", json={"user_id": USER_ID}
    )
    document_status = response.json().get("status")

    assert (
        document_status == DocumentEditStatus.checked_out
    )  # since it was made fresh by this user


def test_document_unload(client, document_id):
    # create document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json().get("document_id")

    # unload document
    response = client.post(
        f"/api/document/{document_id}/unload",
        data={"user_id": Form(USER_ID)},
    )

    assert response.status_code == 200
    assert response.json().get("status") == DocumentEditStatus.unlocked


def test_load_plan_from_share(client, document_id):
    # create document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json().get("document_id")

    # share the document
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

    # load the document
    response = client.post(
        "/api/share/load_plan_from_share",
        json={
            "user_id": USER_ID,
            "password": "password",
            "token": decoded_token["token"],
            "access": DocumentShareStatus.read,
        },
    )

    assert response.status_code == 200


def test_document_checkout(client, document_id):
    # create a document
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "user_id": USER_ID,
        },
    )
    document_id = response.json().get("document_id")

    # share the document
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

    assert response.status_code == 200
    assert response.json().get("status") == DocumentEditStatus.checked_out
