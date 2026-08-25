"""Boundary tests for the submissions system.

Per the testing policy: form-config validation decisions, private-field
leakage, teams×admin_teams enforcement (bypass-by-URL is this repo's
historical bug class), draft-finalize capability semantics, and
clone-at-submission (the frozen-gallery data path).
"""

import pytest
from sqlmodel import Session, col, select
from unittest.mock import patch

from app.core.security import auth
from app.main import app
from app.models import Assignments, Document
from app.submissions.fields import slugify
from app.submissions.models import FormConfig, Submission
from app.submissions.moderation import moderate_submission_by_id
from tests.constants import GERRY_DB_FIXTURE_NAME
from tests.test_utils import (  # noqa: F401 (autouse fixtures)
    override_auth_dependency,
    patch_turnstile,
)

PORTAL = "test-portal"
OTHER_PORTAL = "other-portal"

REVIEW_SCOPE = "create:content_review"
TEAM_A_PAYLOAD = {"sub": "1", "scope": REVIEW_SCOPE, "teams": ["team-a"]}
TEAM_B_PAYLOAD = {"sub": "2", "scope": REVIEW_SCOPE, "teams": ["team-b"]}
NO_TEAMS_PAYLOAD = {"sub": "3", "scope": REVIEW_SCOPE, "teams": []}
UNRESTRICTED_PAYLOAD = {"sub": "4", "scope": f"{REVIEW_SCOPE} read:read-all"}


@pytest.fixture(name="form_config")
def form_config_fixture(session: Session):
    config = FormConfig(
        portal_id=PORTAL,
        name="Test portal form",
        fields=[
            "first_name",
            "email",
            "title",
            "comment",
            "place",
            "state",
            "zip_code",
        ],
        required_fields=["first_name", "email", "title", "comment"],
        admin_teams=["team-a"],
    )
    other = FormConfig(
        portal_id=OTHER_PORTAL,
        name="Other portal form",
        fields=["title", "comment"],
        required_fields=["title"],
        admin_teams=["team-b"],
    )
    session.add(config)
    session.add(other)
    session.commit()
    return config


def _set_auth(payload: dict):
    app.dependency_overrides[auth.verify] = lambda: payload


VALID_FIELDS = {
    "first_name": "Ada",
    "email": "ada@example.com",
    "title": "My testimony",
    "comment": "Keep the river whole.",
}


def _submit(client, fields=None, tags=None, map_ref=None, portal_id=PORTAL):
    return client.post(
        "/api/submissions",
        json={
            "portal_id": portal_id,
            "fields": fields if fields is not None else VALID_FIELDS,
            "tags": tags or [],
            "map_ref": map_ref,
            "turnstile_token": "test_token",
        },
    )


def _mark_ready(session: Session, document_id: str):
    doc = session.exec(
        select(Document).where(col(Document.document_id) == document_id)
    ).one()
    doc.map_metadata = {**(doc.map_metadata or {}), "draft_status": "ready_to_share"}
    session.add(doc)
    session.commit()


# ---------------------------------------------------------------------------
# Form-config validation decisions
# ---------------------------------------------------------------------------


class TestValidation:
    def test_unknown_portal_404(self, client, form_config):
        response = _submit(client, portal_id="no-such-portal")
        assert response.status_code == 404

    def test_all_errors_reported_at_once(self, client, form_config):
        response = _submit(
            client,
            fields={
                "salutation": "Dr.",  # not in this portal's fields
                "email": "not-an-email",
                "zip_code": "abc",
                # first_name, title, comment missing (required)
            },
        )
        assert response.status_code == 422
        errors = response.json()["detail"]
        assert any("salutation" in e for e in errors)
        assert any("first_name" in e for e in errors)
        assert "Invalid email address" in errors
        assert "Invalid zip code" in errors

    def test_valid_submission_immediately_visible(self, client, form_config):
        response = _submit(client, tags=["River Basin"])
        assert response.status_code == 201
        assert set(response.json().keys()) == {"id", "submission_id"}

        listed = client.get(f"/api/submissions?portal_id={PORTAL}").json()
        assert len(listed) == 1
        entry = listed[0]
        # No approval gate: visible right away, portal tag auto-applied,
        # free tags slugified.
        assert entry["fields"]["title"] == "My testimony"
        assert entry["tags"] == [PORTAL, "river-basin"]
        assert entry["nsfw"] is False

    def test_slugify(self):
        assert slugify("  River   Basin! ") == "river-basin"
        assert slugify("UPPER_case") == "upper-case"


# ---------------------------------------------------------------------------
# Private fields
# ---------------------------------------------------------------------------


class TestPrivateFields:
    def test_email_never_in_public_list_but_in_admin(self, client, form_config):
        assert _submit(client).status_code == 201

        public = client.get(f"/api/submissions?portal_id={PORTAL}").json()
        assert "email" not in public[0]["fields"]
        assert public[0]["fields"]["first_name"] == "Ada"

        _set_auth(UNRESTRICTED_PAYLOAD)
        admin = client.get(f"/api/submissions/admin?portal_id={PORTAL}").json()
        assert admin[0]["fields"]["email"] == "ada@example.com"


# ---------------------------------------------------------------------------
# Moderation → nsfw, takedown, flag
# ---------------------------------------------------------------------------


class TestModerationAndVisibility:
    def test_nsfw_scoring_and_toggle(self, client, form_config, session):
        submission_id = _submit(client).json()["id"]
        with patch("app.submissions.moderation.score_text", return_value=0.9):
            moderate_submission_by_id(submission_id, session=session)

        public = client.get(f"/api/submissions?portal_id={PORTAL}").json()
        # nsfw rows stay listed — the frontend blurs them.
        assert public[0]["nsfw"] is True

        # Reviewer can unblur a false positive.
        _set_auth(TEAM_A_PAYLOAD)
        response = client.post(
            f"/api/submissions/admin/{submission_id}/nsfw", json={"nsfw": False}
        )
        assert response.status_code == 200
        assert (
            client.get(f"/api/submissions?portal_id={PORTAL}").json()[0]["nsfw"]
            is False
        )

    def test_takedown_hides_from_public_not_admin(self, client, form_config):
        submission_id = _submit(client).json()["id"]
        _set_auth(TEAM_A_PAYLOAD)
        response = client.post(
            f"/api/submissions/admin/{submission_id}/hidden", json={"hidden": True}
        )
        assert response.status_code == 200

        assert client.get(f"/api/submissions?portal_id={PORTAL}").json() == []
        admin = client.get(f"/api/submissions/admin?portal_id={PORTAL}").json()
        assert admin[0]["hidden"] is True

    def test_flag_visible_only(self, client, form_config, session):
        submission_id = _submit(client).json()["id"]
        assert (
            client.post("/api/submissions/flag", json={"id": submission_id}).status_code
            == 200
        )
        submission = session.get(Submission, submission_id)
        assert submission.flagged is True

        # Hidden submissions cannot be flagged (no oracle, no harassment).
        submission.hidden = True
        session.add(submission)
        session.commit()
        assert (
            client.post("/api/submissions/flag", json={"id": submission_id}).status_code
            == 404
        )


# ---------------------------------------------------------------------------
# Teams × admin_teams enforcement
# ---------------------------------------------------------------------------


class TestTeamScoping:
    def test_matching_team_can_list(self, client, form_config):
        _submit(client)
        _set_auth(TEAM_A_PAYLOAD)
        response = client.get(f"/api/submissions/admin?portal_id={PORTAL}")
        assert response.status_code == 200

    def test_wrong_team_403(self, client, form_config):
        _set_auth(TEAM_B_PAYLOAD)
        response = client.get(f"/api/submissions/admin?portal_id={PORTAL}")
        assert response.status_code == 403

    def test_empty_teams_claim_allows_nothing(self, client, form_config):
        _set_auth(NO_TEAMS_PAYLOAD)
        response = client.get(f"/api/submissions/admin?portal_id={PORTAL}")
        assert response.status_code == 403

    def test_bypass_by_omitting_portal_id_refused(self, client, form_config):
        _set_auth(TEAM_A_PAYLOAD)
        response = client.get("/api/submissions/admin")
        assert response.status_code == 400

    def test_unrestricted_may_omit_portal_id(self, client, form_config):
        _set_auth(UNRESTRICTED_PAYLOAD)
        response = client.get("/api/submissions/admin")
        assert response.status_code == 200

    def test_absent_teams_claim_unrestricted(self, client, form_config):
        _set_auth({"sub": "5", "scope": REVIEW_SCOPE})
        response = client.get(f"/api/submissions/admin?portal_id={PORTAL}")
        assert response.status_code == 200

    def test_actions_scoped_by_submission_portal(self, client, form_config):
        submission_id = _submit(client).json()["id"]
        # team-b administers other-portal, not this submission's portal.
        _set_auth(TEAM_B_PAYLOAD)
        for action, body in (("nsfw", {"nsfw": True}), ("hidden", {"hidden": True})):
            response = client.post(
                f"/api/submissions/admin/{submission_id}/{action}", json=body
            )
            assert response.status_code == 403, action


# ---------------------------------------------------------------------------
# Clone at submission
# ---------------------------------------------------------------------------


def _assignment_count(session, document_id):
    return len(
        session.exec(
            select(Assignments).where(col(Assignments.document_id) == document_id)
        ).all()
    )


class TestCloneAtSubmission:
    def test_map_must_be_ready_to_share(self, client, form_config, document_id):
        response = _submit(client, map_ref=document_id)
        assert response.status_code == 409

    def test_submission_stores_frozen_clone(
        self, client, form_config, document_id, session
    ):
        doc = client.get(f"/api/document/{document_id}").json()
        put = client.put(
            "/api/assignments",
            json={
                "document_id": document_id,
                "assignments": [["vtd:000010000001", 1]],
                "last_updated_at": doc["updated_at"],
            },
        )
        assert put.status_code == 200
        _mark_ready(session, document_id)

        response = _submit(client, map_ref=document_id)
        assert response.status_code == 201, response.json()

        submission = session.get(Submission, response.json()["id"])
        assert submission.map_public_id is not None
        assert submission.map_public_id != doc["public_id"]

        clone = session.exec(
            select(Document).where(col(Document.public_id) == submission.map_public_id)
        ).one()
        # The clone is frozen ready_to_share with the plan copied over...
        assert (clone.map_metadata or {}).get("draft_status") == "ready_to_share"
        assert _assignment_count(session, clone.document_id) == 1

        # ...and later edits to the original leave it untouched.
        doc2 = client.get(f"/api/document/{document_id}").json()
        put2 = client.put(
            "/api/assignments",
            json={
                "document_id": document_id,
                "assignments": [
                    ["vtd:000010000001", 2],
                    ["vtd:000010000002", 2],
                ],
                "last_updated_at": doc2["updated_at"],
            },
        )
        assert put2.status_code == 200
        assert _assignment_count(session, clone.document_id) == 1

        # The gallery lists the clone under the portal tag.
        gallery = client.get(f"/api/documents/list?tags={PORTAL}").json()
        assert [d["public_id"] for d in gallery] == [submission.map_public_id]


# ---------------------------------------------------------------------------
# Draft → finalize capability semantics
# ---------------------------------------------------------------------------


class TestDraftFinalize:
    @pytest.fixture(autouse=True)
    def _map_module(self, ks_demo_view_census_blocks_districtrmap):
        """create_document needs the map module to exist."""

    def _create_draft(self, client):
        response = client.post(
            "/api/create_document",
            json={"districtr_map_slug": GERRY_DB_FIXTURE_NAME, "portal_id": PORTAL},
        )
        assert response.status_code == 201, response.json()
        return response.json()

    def _finalize(self, client, submission_id, fields=None):
        return client.put(
            f"/api/submissions/{submission_id}/finalize",
            json={
                "fields": fields if fields is not None else VALID_FIELDS,
                "tags": [],
                "turnstile_token": "test_token",
            },
        )

    def test_create_document_with_portal_creates_draft(
        self, client, form_config, session
    ):
        doc = self._create_draft(client)
        assert doc["submission_id"] is not None
        draft = session.exec(
            select(Submission).where(
                col(Submission.submission_id) == doc["submission_id"]
            )
        ).one()
        assert draft.status == "draft"
        assert draft.map_public_id == doc["public_id"]
        # Drafts are invisible publicly and never in the gallery.
        assert client.get(f"/api/submissions?portal_id={PORTAL}").json() == []

    def test_create_document_with_unknown_portal_404(self, client, form_config):
        response = client.post(
            "/api/create_document",
            json={"districtr_map_slug": GERRY_DB_FIXTURE_NAME, "portal_id": "nope"},
        )
        assert response.status_code == 404

    def test_unknown_capability_404(self, client, form_config):
        response = self._finalize(client, "00000000-0000-0000-0000-000000000000")
        assert response.status_code == 404

    def test_finalize_requires_ready_to_share(self, client, form_config):
        doc = self._create_draft(client)
        response = self._finalize(client, doc["submission_id"])
        assert response.status_code == 409

    def test_finalize_then_double_finalize_409(self, client, form_config, session):
        doc = self._create_draft(client)
        _mark_ready(session, doc["document_id"])

        response = self._finalize(client, doc["submission_id"])
        assert response.status_code == 200, response.json()

        submission = session.exec(
            select(Submission).where(
                col(Submission.submission_id) == doc["submission_id"]
            )
        ).one()
        assert submission.status == "submitted"
        # Repointed at a frozen clone, not the user's working document.
        assert submission.map_public_id != doc["public_id"]

        listed = client.get(f"/api/submissions?portal_id={PORTAL}").json()
        assert len(listed) == 1

        assert self._finalize(client, doc["submission_id"]).status_code == 409

    def test_finalize_validates_fields(self, client, form_config, session):
        doc = self._create_draft(client)
        _mark_ready(session, doc["document_id"])
        response = self._finalize(client, doc["submission_id"], fields={})
        assert response.status_code == 422
