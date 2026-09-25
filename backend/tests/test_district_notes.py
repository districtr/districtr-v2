"""Boundary tests for comments.district_notes (zone notes).

Covers the decisions and data-loss paths: per-map limits, moderation → nsfw
and its public/edit visibility split, copy-on-duplicate, and FK cascade.
Sync create/update/delete parity is covered end-to-end in
test_community_mode.py and test_comments.py::test_create_comment_with_zone_and_document.
"""

from unittest.mock import patch

from sqlmodel import col, select, text

from app.district_notes.models import DistrictNote
from app.district_notes.tasks import moderate_note_by_id
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


@patch("app.submissions.moderation.score_text", return_value=CLEAN_SCORE)
def test_note_truncated_to_map_length_limit(_mock, client, document_id, session):
    response = _put_note(client, document_id, "x" * 500)
    assert response.status_code == 200, response.json()
    note = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
    ).one()
    assert len(note.note) == 240  # DEFAULT_MAX_COMMENT_LENGTH


@patch("app.submissions.moderation.score_text", return_value=CLEAN_SCORE)
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


@patch("app.submissions.moderation.score_text", return_value=NSFW_SCORE)
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


@patch("app.submissions.moderation.score_text", return_value=CLEAN_SCORE)
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


@patch("app.submissions.moderation.score_text", return_value=CLEAN_SCORE)
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


@patch("app.submissions.moderation.score_text", return_value=CLEAN_SCORE)
def test_negative_zone_is_rejected_as_validation_error(_mock, client, document_id):
    # Mirrors the zone_non_negative CHECK: bad input must 422, never surface
    # as an IntegrityError 500 that rolls back the whole assignments save.
    response = _put_note(client, document_id, "note", zone=-1)
    assert response.status_code == 422


@patch("app.submissions.moderation.score_text", return_value=CLEAN_SCORE)
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


@patch("app.submissions.moderation.score_text", return_value=CLEAN_SCORE)
def test_matched_id_in_another_zone_does_not_relabel(
    _mock, client, document_id, session
):
    # Unsaved notes carry client UUIDs; a lenient parseInt("3f25…") once sent a
    # real row id under the wrong zone and overwrote that zone's note.
    assert _put_note(client, document_id, "zone one", zone=1).status_code == 200
    zone_one = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
    ).one()

    document_info = client.get(f"/api/document/{document_id}").json()
    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [],
            "comments": [
                {"comment_id": zone_one.id, "zone": 1, "text": "zone one"},
                {"comment_id": zone_one.id, "zone": 2, "text": "zone two"},
            ],
            "last_updated_at": document_info["updated_at"],
        },
    )
    assert response.status_code == 200, response.json()
    session.expire_all()
    notes = {
        n.zone: n.note
        for n in session.exec(
            select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
        )
    }
    assert notes == {1: "zone one", 2: "zone two"}


@patch("app.submissions.moderation.score_text", return_value=CLEAN_SCORE)
def test_unchanged_note_is_not_rescored(mock_score, client, document_id, session):
    assert _put_note(client, document_id, "same text").status_code == 200
    assert mock_score.call_count == 1
    note = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
    ).one()
    # The client resends the whole set on every save.
    assert (
        _put_note(client, document_id, "same text", comment_id=note.id).status_code
        == 200
    )
    assert mock_score.call_count == 1
    assert (
        _put_note(client, document_id, "edited", comment_id=note.id).status_code == 200
    )
    assert mock_score.call_count == 2


LABELED_PLAN = {
    "districtr_map_slug": "simple_geos",
    "assignments": [
        ["000010000000001", "My zone 1"],
        ["000010000000003", "My zone 1"],
        ["000010000000006", "My zone 3"],
    ],
}


def _notes_for(session, document_id):
    session.expire_all()
    return {
        n.zone: n
        for n in session.exec(
            select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
        )
    }


@patch("app.submissions.moderation.score_text", return_value=NSFW_SCORE)
def test_csv_relabel_notes_are_moderated(
    mock_score, client, session, simple_shatterable_districtr_map, mock_grid_graph_file
):
    # The relabel loop used to build rows directly, skipping limits and
    # moderation: raw CSV labels reached the public read unscored.
    response = client.post("/api/create_document", json=LABELED_PLAN)
    assert response.status_code == 201, response.json()
    remapping = response.json()["zone_label_remapping"]
    notes = _notes_for(session, response.json()["document_id"])
    assert notes[remapping["My zone 1"]].note == "Originally labeled as My zone 1"
    assert notes[remapping["My zone 3"]].note == "Originally labeled as My zone 3"
    # The task writes through its own session, which can't see this test's
    # uncommitted rows; the call count is what proves moderation was scheduled.
    assert mock_score.call_count == 2


@patch("app.submissions.moderation.score_text", return_value=CLEAN_SCORE)
def test_csv_relabel_notes_dropped_when_descriptions_disabled(
    _mock, client, session, simple_shatterable_districtr_map, mock_grid_graph_file
):
    # comment_length_limit = 0 is the "descriptions disabled" config: the editor
    # can't show or delete a note, so a CSV upload must not create one either.
    session.execute(
        text(
            "UPDATE districtrmap SET comment_length_limit = 0 "
            "WHERE districtr_map_slug = 'simple_geos'"
        )
    )
    response = client.post("/api/create_document", json=LABELED_PLAN)
    assert response.status_code == 201, response.json()
    assert response.json()["zone_label_remapping"]
    assert _notes_for(session, response.json()["document_id"]) == {}
