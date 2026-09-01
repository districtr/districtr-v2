"""Boundary tests for comments.district_notes (zone notes).

Covers the decisions and data-loss paths: per-map limits, moderation → nsfw
and its public/edit visibility split, copy-on-duplicate, and FK cascade.
Sync create/update/delete parity is covered end-to-end in
test_community_mode.py and test_comments.py::test_create_comment_with_zone_and_document.
"""

from unittest.mock import patch

from sqlmodel import col, select, text

from app.district_notes import DistrictNote, moderate_note_by_id
from tests.constants import GERRY_DB_FIXTURE_NAME

CLEAN_SCORE = 0.001
NSFW_SCORE = 0.95


def _put_note(client, document_id, note_text, zone=1, comment_id=None):
    document_info = client.get(f"/api/document/{document_id}").json()
    body = {
        "document_id": document_id,
        "assignments": [],
        "comments": [
            {"comment_id": comment_id, "zone": zone, "text": note_text},
        ],
        "last_updated_at": document_info["updated_at"],
    }
    return client.put("/api/assignments", json=body)


@patch("app.comments.moderation.score_text", return_value=CLEAN_SCORE)
def test_note_truncated_to_map_length_limit(_mock, client, document_id, session):
    response = _put_note(client, document_id, "x" * 500)
    assert response.status_code == 200, response.json()
    note = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
    ).one()
    assert len(note.note) == 240  # DEFAULT_MAX_COMMENT_LENGTH


@patch("app.comments.moderation.score_text", return_value=CLEAN_SCORE)
def test_per_zone_note_limit_enforced(_mock, client, document_id):
    document_info = client.get(f"/api/document/{document_id}").json()
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [],
            "comments": [
                {"zone": 1, "text": "first"},
                {"zone": 1, "text": "second"},
            ],
            "last_updated_at": document_info["updated_at"],
        },
    )
    assert response.status_code == 400
    assert "per zone" in response.json()["detail"]


@patch("app.comments.moderation.score_text", return_value=NSFW_SCORE)
def test_nsfw_note_hidden_publicly_visible_to_editor(
    _mock, client, document_id, session
):
    response = _put_note(client, document_id, "offensive text")
    assert response.status_code == 200, response.json()

    note = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
    ).one()
    # The real background task writes on its own session, which cannot see
    # this test transaction — score in-session instead to exercise the
    # score → nsfw decision.
    moderate_note_by_id(note.id, note.note, session=session)
    session.refresh(note)
    assert note.nsfw is True
    assert note.moderation_score == NSFW_SCORE

    # Edit access (UUID): real text, flagged moderated.
    edit_doc = client.get(f"/api/document/{document_id}").json()
    assert edit_doc["document_comments"][0]["text"] == "offensive text"
    assert edit_doc["document_comments"][0]["moderated"] is True

    # Public access (public_id): placeholder.
    public_doc = client.get(f"/api/document/{edit_doc['public_id']}").json()
    assert (
        public_doc["document_comments"][0]["text"]
        == "Comment removed due to moderation."
    )


@patch("app.comments.moderation.score_text", return_value=CLEAN_SCORE)
def test_copy_carries_notes_and_moderation_verdict(_mock, client, document_id, session):
    response = _put_note(client, document_id, "carry me over")
    assert response.status_code == 200, response.json()
    # Simulate a prior nsfw verdict on the source note.
    source_note = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
    ).one()
    source_note.nsfw = True
    source_note.moderation_score = NSFW_SCORE
    session.add(source_note)
    session.commit()

    copy_response = client.post(
        "/api/create_document",
        json={
            "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
            "copy_from_doc": document_id,
        },
    )
    assert copy_response.status_code == 201, copy_response.json()
    copy_id = copy_response.json()["document_id"]

    copied = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == copy_id)
    ).one()
    assert copied.note == "carry me over"
    assert copied.zone == 1
    # The verdict travels with the copy: create_document needs only a session
    # token, so a reset here would let anyone launder a moderated note into
    # public view by copying the map and never saving.
    assert copied.nsfw is True
    assert copied.moderation_score == NSFW_SCORE
    # The source keeps its own row.
    assert copied.id != source_note.id


@patch("app.comments.moderation.score_text", return_value=CLEAN_SCORE)
def test_notes_cascade_on_document_delete(_mock, client, document_id, session):
    response = _put_note(client, document_id, "doomed note")
    assert response.status_code == 200, response.json()

    session.connection().execute(
        text("DELETE FROM document.document WHERE document_id = CAST(:doc AS UUID)"),
        {"doc": document_id},
    )
    session.commit()
    remaining = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
    ).all()
    assert remaining == []


@patch("app.comments.moderation.score_text", return_value=CLEAN_SCORE)
def test_negative_zone_is_rejected_as_validation_error(_mock, client, document_id):
    # Mirrors the zone_non_negative CHECK: bad input must 422, never surface
    # as an IntegrityError 500 that rolls back the whole assignments save.
    response = _put_note(client, document_id, "note", zone=-1)
    assert response.status_code == 422


@patch("app.comments.moderation.score_text", return_value=CLEAN_SCORE)
def test_empty_note_is_treated_as_deletion(_mock, client, document_id, session):
    response = _put_note(client, document_id, "real note")
    assert response.status_code == 200, response.json()
    note_id = session.exec(
        select(DistrictNote.id).where(col(DistrictNote.document_id) == document_id)
    ).one()

    # Re-sync the same note with whitespace-only text: the row is deleted
    # (not a note_not_empty CHECK violation 500).
    response = _put_note(client, document_id, "   ", comment_id=note_id)
    assert response.status_code == 200, response.json()
    remaining = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
    ).all()
    assert remaining == []
