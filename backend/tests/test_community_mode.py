import pytest
from sqlalchemy import text
from sqlmodel import Session
from unittest.mock import patch

from app.utils import create_districtr_map
from tests.constants import GERRY_DB_FIXTURE_NAME

COMMUNITY_MAP_SLUG = "ks_demo_view_census_blocks_community"
TEST_MODERATION_SCORE = 0.001


def build_community_metadata_list():
    return [
        {
            "id": 1,
            "render_order_id": 1,
            "name": "Water Access",
            "description": "Community focused on watershed issues",
            "color": "#00AAFF",
            "createdAt": "2026-03-13T00:00:00.000Z",
            "descriptionCommentId": None,
        },
        {
            "id": 2,
            "render_order_id": 2,
            "name": "Transit Riders",
            "description": "Community focused on transit access",
            "color": "#FF8800",
            "createdAt": "2026-03-13T00:00:01.000Z",
            "descriptionCommentId": None,
        },
    ]


@pytest.fixture(name="community_map_slug")
def community_map_slug_fixture(
    session: Session, ks_demo_view_census_blocks_districtrmap
):
    create_districtr_map(
        session=session,
        name="Community map for tests",
        districtr_map_slug=COMMUNITY_MAP_SLUG,
        gerrydb_table_name=GERRY_DB_FIXTURE_NAME,
        parent_layer=GERRY_DB_FIXTURE_NAME,
        map_type="community",
        num_districts=4,
    )
    session.commit()
    return COMMUNITY_MAP_SLUG


@pytest.fixture(name="community_document_id")
def community_document_id_fixture(client, community_map_slug: str):
    response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": community_map_slug,
        },
    )
    assert response.status_code == 201, response.json()
    return response.json()["document_id"]


def get_assignments_by_geoid(client, document_id: str):
    assignments_response = client.get(f"/api/get_assignments/{document_id}")
    assert assignments_response.status_code == 200
    return {
        assignment["geo_id"]: assignment["zone"]
        for assignment in assignments_response.json()
    }


def test_put_community_assignments_round_trip_with_metadata_and_comments(
    client, community_document_id: str, session: Session
):
    document_info = client.get(f"/api/document/{community_document_id}").json()
    community_metadata_list = build_community_metadata_list()

    response = client.put(
        "/api/assignments",
        json={
            "document_id": community_document_id,
            "assignments": [
                ["202090441022004", 1],
                ["202090428002008", 1],
                ["200979691001108", None],
            ],
            "map_type": "community",
            "metadata": {
                "num_communities": 2,
                "community_metadata_list": community_metadata_list,
            },
            "comments": [
                {
                    "text": "Community 1 note",
                    "zone": 1,
                }
            ],
            "last_updated_at": document_info["updated_at"],
        },
    )

    assert response.status_code == 200, response.json()
    assert response.json()["assignments_inserted"] == 3

    assignments_by_geoid = get_assignments_by_geoid(client, community_document_id)
    assert assignments_by_geoid == {
        "202090441022004": 1,
        "202090428002008": 1,
        "200979691001108": None,
    }

    updated_document = client.get(f"/api/document/{community_document_id}").json()
    assert updated_document["map_type"] == "community"
    assert updated_document["num_communities"] == 2
    assert updated_document["community_metadata_list"] == community_metadata_list
    assert len(updated_document["document_comments"]) == 1
    assert updated_document["document_comments"][0]["zone"] == 1
    assert updated_document["document_comments"][0]["text"] == "Community 1 note"

    comment_rows = session.execute(
        text("""
            SELECT zone
            FROM comments.document_comment
            WHERE document_id = :document_id
            """),
        {"document_id": community_document_id},
    ).fetchall()
    assert len(comment_rows) == 1
    assert comment_rows[0][0] == 1


def test_copy_community_document_duplicates_assignments_and_metadata(
    client, community_document_id: str, community_map_slug: str
):
    document_info = client.get(f"/api/document/{community_document_id}").json()
    community_metadata_list = build_community_metadata_list()

    update_response = client.put(
        "/api/assignments",
        json={
            "document_id": community_document_id,
            "assignments": [
                ["202090441022004", 1],
                ["202090428002008", 2],
                ["200979691001108", None],
            ],
            "map_type": "community",
            "metadata": {
                "num_communities": 2,
                "community_metadata_list": community_metadata_list,
            },
            "last_updated_at": document_info["updated_at"],
        },
    )
    assert update_response.status_code == 200, update_response.json()

    copy_response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": community_map_slug,
            "copy_from_doc": community_document_id,
        },
    )
    assert copy_response.status_code == 201, copy_response.json()
    copied_document = copy_response.json()
    copied_document_id = copied_document["document_id"]

    assert copied_document["map_type"] == "community"
    assert copied_document["inserted_assignments"] == 3
    assert copied_document["num_communities"] == 2
    assert copied_document["community_metadata_list"] == community_metadata_list

    original_assignments = sorted(
        client.get(f"/api/get_assignments/{community_document_id}").json(),
        key=lambda assignment: assignment["geo_id"],
    )
    copied_assignments = sorted(
        client.get(f"/api/get_assignments/{copied_document_id}").json(),
        key=lambda assignment: assignment["geo_id"],
    )
    assert copied_assignments == original_assignments


def test_put_community_assignments_conflict_requires_overwrite(
    client, community_document_id: str
):
    document_info = client.get(f"/api/document/{community_document_id}").json()
    first_metadata = [build_community_metadata_list()[0]]

    first_response = client.put(
        "/api/assignments",
        json={
            "document_id": community_document_id,
            "assignments": [["202090441022004", 1]],
            "map_type": "community",
            "metadata": {
                "num_communities": 1,
                "community_metadata_list": first_metadata,
            },
            "last_updated_at": document_info["updated_at"],
        },
    )
    assert first_response.status_code == 200, first_response.json()

    conflict_response = client.put(
        "/api/assignments",
        json={
            "document_id": community_document_id,
            "assignments": [["202090441022004", 2]],
            "map_type": "community",
            "last_updated_at": "1970-01-01T00:00:00.000000Z",
        },
    )
    assert conflict_response.status_code == 409
    assert (
        conflict_response.json()["detail"]
        == "Document has been updated since the last update"
    )
    assert get_assignments_by_geoid(client, community_document_id) == {
        "202090441022004": 1
    }

    full_metadata = build_community_metadata_list()
    overwrite_response = client.put(
        "/api/assignments",
        json={
            "document_id": community_document_id,
            "assignments": [
                ["202090441022004", 2],
                ["202090428002008", None],
            ],
            "map_type": "community",
            "metadata": {
                "num_communities": 2,
                "community_metadata_list": full_metadata,
            },
            "overwrite": True,
            "last_updated_at": "1970-01-01T00:00:00.000000Z",
        },
    )
    assert overwrite_response.status_code == 200, overwrite_response.json()

    updated_document = client.get(f"/api/document/{community_document_id}").json()
    assert get_assignments_by_geoid(client, community_document_id) == {
        "202090441022004": 2,
        "202090428002008": None,
    }
    assert updated_document["num_communities"] == 2
    assert updated_document["community_metadata_list"] == full_metadata


@patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
def test_reset_community_assignments_preserves_metadata_and_comments(
    _mock_score_text, client, community_document_id: str, session: Session
):
    document_info = client.get(f"/api/document/{community_document_id}").json()
    community_metadata_list = build_community_metadata_list()

    update_response = client.put(
        "/api/assignments",
        json={
            "document_id": community_document_id,
            "assignments": [
                ["202090441022004", 1],
                ["202090428002008", 2],
                ["200979691001108", None],
            ],
            "map_type": "community",
            "metadata": {
                "num_communities": 2,
                "community_metadata_list": community_metadata_list,
            },
            "comments": [
                {
                    "text": "Community 1 note",
                    "zone": 1,
                }
            ],
            "last_updated_at": document_info["updated_at"],
        },
    )
    assert update_response.status_code == 200, update_response.json()

    reset_response = client.patch(f"/api/assignments/{community_document_id}/reset")
    assert reset_response.status_code == 200, reset_response.json()

    assert get_assignments_by_geoid(client, community_document_id) == {}

    updated_document = client.get(f"/api/document/{community_document_id}").json()
    assert updated_document["num_communities"] == 2
    assert updated_document["community_metadata_list"] == community_metadata_list
    assert len(updated_document["document_comments"]) == 1
    assert updated_document["document_comments"][0]["zone"] == 1
    assert updated_document["document_comments"][0]["text"] == "Community 1 note"

    community_assignment_count = session.execute(
        text("""
            SELECT COUNT(*)
            FROM document.community_assignments
            WHERE document_id = :document_id
            """),
        {"document_id": community_document_id},
    ).scalar_one()
    assert community_assignment_count == 0

    comment_count = session.execute(
        text("""
            SELECT COUNT(*)
            FROM comments.document_comment
            WHERE document_id = :document_id
            """),
        {"document_id": community_document_id},
    ).scalar_one()
    assert comment_count == 1


@patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
def test_sync_community_comments_updates_and_deletes_existing_rows(
    _mock_score_text, client, community_document_id: str, session: Session
):
    document_info = client.get(f"/api/document/{community_document_id}").json()

    first_response = client.put(
        "/api/assignments",
        json={
            "document_id": community_document_id,
            "assignments": [
                ["202090441022004", 1],
                ["202090428002008", 2],
            ],
            "map_type": "community",
            "comments": [
                {"text": "Community 1 first note", "zone": 1},
                {"text": "Community 2 first note", "zone": 2},
            ],
            "last_updated_at": document_info["updated_at"],
        },
    )
    assert first_response.status_code == 200, first_response.json()

    first_document = client.get(f"/api/document/{community_document_id}").json()
    first_comments = {
        comment["zone"]: comment for comment in first_document["document_comments"]
    }
    assert set(first_comments) == {1, 2}

    second_response = client.put(
        "/api/assignments",
        json={
            "document_id": community_document_id,
            "assignments": [
                ["202090441022004", 1],
                ["202090428002008", 2],
            ],
            "map_type": "community",
            "comments": [
                {
                    "comment_id": first_comments[1]["comment_id"],
                    "text": "Community 1 updated note",
                    "zone": 1,
                }
            ],
            "last_updated_at": first_document["updated_at"],
        },
    )
    assert second_response.status_code == 200, second_response.json()

    second_document = client.get(f"/api/document/{community_document_id}").json()
    assert len(second_document["document_comments"]) == 1
    assert second_document["document_comments"][0]["zone"] == 1
    assert (
        second_document["document_comments"][0]["comment_id"]
        == first_comments[1]["comment_id"]
    )
    assert second_document["document_comments"][0]["text"] == "Community 1 updated note"

    remaining_comment_rows = session.execute(
        text("""
            SELECT dc.zone, c.id, c.title, c.comment
            FROM comments.document_comment dc
            JOIN comments.comment c ON c.id = dc.comment_id
            WHERE dc.document_id = :document_id
            ORDER BY dc.zone
            """),
        {"document_id": community_document_id},
    ).fetchall()
    assert [tuple(row) for row in remaining_comment_rows] == [
        (
            1,
            int(first_comments[1]["comment_id"]),
            "Community 1 note",
            "Community 1 updated note",
        )
    ]

    delete_all_response = client.put(
        "/api/assignments",
        json={
            "document_id": community_document_id,
            "assignments": [
                ["202090441022004", 1],
                ["202090428002008", 2],
            ],
            "map_type": "community",
            "comments": [],
            "last_updated_at": second_document["updated_at"],
        },
    )
    assert delete_all_response.status_code == 200, delete_all_response.json()

    final_document = client.get(f"/api/document/{community_document_id}").json()
    assert final_document["document_comments"] is None

    final_comment_count = session.execute(
        text("""
            SELECT COUNT(*)
            FROM comments.document_comment
            WHERE document_id = :document_id
            """),
        {"document_id": community_document_id},
    ).scalar_one()
    assert final_comment_count == 0


def test_community_assignment_none_is_stored_as_zero_and_returned_as_null(
    client, community_document_id: str, session: Session
):
    document_info = client.get(f"/api/document/{community_document_id}").json()

    response = client.put(
        "/api/assignments",
        json={
            "document_id": community_document_id,
            "assignments": [
                ["202090441022004", None],
                ["202090428002008", 2],
            ],
            "map_type": "community",
            "last_updated_at": document_info["updated_at"],
        },
    )
    assert response.status_code == 200, response.json()

    stored_assignments = session.execute(
        text("""
            SELECT geo_id, community_id
            FROM document.community_assignments
            WHERE document_id = :document_id
            ORDER BY geo_id
            """),
        {"document_id": community_document_id},
    ).fetchall()
    assert [tuple(row) for row in stored_assignments] == [
        ("202090428002008", 2),
        ("202090441022004", 0),
    ]

    assert get_assignments_by_geoid(client, community_document_id) == {
        "202090441022004": None,
        "202090428002008": 2,
    }
