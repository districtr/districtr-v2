"""Boundary tests for comments.district_notes (zone notes).

Covers the decisions and data-loss paths: per-map limits, no moderation
(notes are served verbatim), copy-on-duplicate, and FK cascade.
Sync create/update/delete parity is covered end-to-end in
test_community_mode.py and test_comments.py::test_create_comment_with_zone_and_document.
"""

from sqlmodel import col, select, text

from app.district_notes.models import DistrictNote
from tests.constants import GERRY_DB_FIXTURE_NAME


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


def test_note_truncated_to_map_length_limit(client, document_id, session):
    response = _put_note(client, document_id, "x" * 500)
    assert response.status_code == 200, response.json()
    note = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
    ).one()
    assert len(note.note) == 240  # DEFAULT_MAX_COMMENT_LENGTH


def test_per_zone_note_limit_enforced(client, document_id):
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


def test_notes_are_not_moderated(client, document_id):
    # Moderation is for portal submissions only: a note is the author's own
    # annotation and is served verbatim on both the edit and public reads.
    response = _put_note(client, document_id, "this map is garbage")
    assert response.status_code == 200, response.json()

    edit_doc = client.get(f"/api/document/{document_id}").json()
    public_doc = client.get(f"/api/document/{edit_doc['public_id']}").json()
    for doc in (edit_doc, public_doc):
        assert doc["document_comments"][0]["text"] == "this map is garbage"
        assert "moderated" not in doc["document_comments"][0]


def test_copy_carries_notes(client, document_id, session):
    response = _put_note(client, document_id, "carry me over")
    assert response.status_code == 200, response.json()
    source_note = session.exec(
        select(DistrictNote).where(col(DistrictNote.document_id) == document_id)
    ).one()

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
    # The source keeps its own row.
    assert copied.id != source_note.id


def test_notes_cascade_on_document_delete(client, document_id, session):
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


def test_negative_zone_is_rejected_as_validation_error(client, document_id):
    # Mirrors the zone_non_negative CHECK: bad input must 422, never surface
    # as an IntegrityError 500 that rolls back the whole assignments save.
    response = _put_note(client, document_id, "note", zone=-1)
    assert response.status_code == 422


def test_empty_note_is_treated_as_deletion(client, document_id, session):
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


def test_matched_id_in_another_zone_does_not_relabel(client, document_id, session):
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


def test_csv_relabel_notes_go_through_sync(
    client, session, simple_shatterable_districtr_map, mock_grid_graph_file
):
    # The relabel loop used to build rows directly, skipping the per-map
    # limits (see the descriptions-disabled test below).
    response = client.post("/api/create_document", json=LABELED_PLAN)
    assert response.status_code == 201, response.json()
    remapping = response.json()["zone_label_remapping"]
    notes = _notes_for(session, response.json()["document_id"])
    assert notes[remapping["My zone 1"]].note == "Originally labeled as My zone 1"
    assert notes[remapping["My zone 3"]].note == "Originally labeled as My zone 3"


def test_csv_relabel_notes_dropped_when_descriptions_disabled(
    client, session, simple_shatterable_districtr_map, mock_grid_graph_file
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
