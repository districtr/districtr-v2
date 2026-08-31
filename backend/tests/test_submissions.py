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
from app.district_notes import DistrictNote
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
UNRESTRICTED_PAYLOAD = {"sub": "4", "scope": f"{REVIEW_SCOPE} review:review-all"}


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

    def test_read_all_scope_does_not_bypass_team_scoping(self, client, form_config):
        # read:read-all governs authorship-boundary reads, not moderation
        # reach — only review:review-all lifts the teams restriction.
        _set_auth({**TEAM_B_PAYLOAD, "scope": f"{REVIEW_SCOPE} read:read-all"})
        response = client.get(f"/api/submissions/admin?portal_id={PORTAL}")
        assert response.status_code == 403

    def test_absent_teams_claim_fails_closed(self, client, form_config):
        # Pre-cutover partner tokens carry the review scope but no teams
        # claim; treating absence as unrestricted would fail open for every
        # one of them. Cross-portal callers use review:review-all instead.
        _set_auth({"sub": "5", "scope": REVIEW_SCOPE})
        response = client.get(f"/api/submissions/admin?portal_id={PORTAL}")
        assert response.status_code == 403

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
        source = session.exec(
            select(Document).where(col(Document.document_id) == document_id)
        ).one()
        source.color_scheme = ["#123456"]
        session.add(source)
        session.add(DistrictNote(document_id=document_id, zone=1, note="source note"))
        session.commit()
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
        # ...including snapshot fidelity that could never be fixed later
        # (the clone's edit UUID is unreachable): palette and zone notes.
        assert clone.color_scheme == ["#123456"]
        clone_notes = session.exec(
            select(DistrictNote).where(
                col(DistrictNote.document_id) == clone.document_id
            )
        ).all()
        assert [n.note for n in clone_notes] == ["source note"]

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

    def test_create_document_with_unknown_portal_degrades(
        self, client, form_config, session
    ):
        # portal_id is advisory: a portal page can outlive its FormConfig, so
        # a missing config must degrade to a normal map (no draft), never
        # abort document creation on a live portal page.
        response = client.post(
            "/api/create_document",
            json={"districtr_map_slug": GERRY_DB_FIXTURE_NAME, "portal_id": "nope"},
        )
        assert response.status_code == 201, response.json()
        assert response.json().get("submission_id") is None
        assert (
            session.exec(
                select(Submission).where(col(Submission.portal_id) == "nope")
            ).first()
            is None
        )

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


# ---------------------------------------------------------------------------
# Gallery exclusion and moderation-authority alignment
# ---------------------------------------------------------------------------


class TestGalleryExclusion:
    def _ready_map(self, client, session, document_id):
        _mark_ready(session, document_id)
        return client.get(f"/api/document/{document_id}").json()["public_id"]

    def test_draft_map_stays_out_of_the_tag_gallery(
        self, client, form_config, ks_demo_view_census_blocks_districtrmap, session
    ):
        # A draft's map_public_id points at the LIVE editable document; only
        # status=submitted may surface it in /api/documents/list.
        response = client.post(
            "/api/create_document",
            json={
                "districtr_map_slug": "ks_demo_view_census_blocks",
                "portal_id": PORTAL,
            },
        )
        assert response.status_code == 201, response.json()
        document_id = response.json()["document_id"]
        _mark_ready(session, document_id)

        listed = client.get(f"/api/documents/list?tags={PORTAL}").json()
        assert listed == []

    def test_hidden_and_nsfw_submissions_leave_the_tag_gallery(
        self, client, form_config, document_id, session
    ):
        self._ready_map(client, session, document_id)
        submission_id = _submit(client, map_ref=document_id).json()["id"]
        assert len(client.get(f"/api/documents/list?tags={PORTAL}").json()) == 1

        _set_auth(TEAM_A_PAYLOAD)
        assert (
            client.post(
                f"/api/submissions/admin/{submission_id}/nsfw", json={"nsfw": True}
            ).status_code
            == 200
        )
        assert client.get(f"/api/documents/list?tags={PORTAL}").json() == []

    def test_cross_portal_tags_cannot_inject_into_another_gallery(
        self, client, form_config, document_id, session
    ):
        # Visibility and moderation authority share one key: a submission to
        # OTHER_PORTAL tagged with PORTAL must NOT appear in PORTAL's
        # gallery, where PORTAL's reviewers could never take it down.
        self._ready_map(client, session, document_id)
        response = _submit(
            client,
            fields={"title": "injected"},
            tags=[PORTAL],
            map_ref=document_id,
            portal_id=OTHER_PORTAL,
        )
        assert response.status_code == 201, response.json()
        assert client.get(f"/api/documents/list?tags={PORTAL}").json() == []
        assert len(client.get(f"/api/documents/list?tags={OTHER_PORTAL}").json()) == 1

    def test_takedown_demotes_the_frozen_clone(
        self, client, form_config, document_id, session
    ):
        # hidden=True must remove the clone from direct public fetches too —
        # public_ids are sequential, so listing-only takedown leaves the
        # abusive map one enumeration away.
        self._ready_map(client, session, document_id)
        submission_id = _submit(client, map_ref=document_id).json()["id"]
        submission = session.get(Submission, submission_id)
        clone_public_id = submission.map_public_id

        _set_auth(TEAM_A_PAYLOAD)
        response = client.post(
            f"/api/submissions/admin/{submission_id}/hidden", json={"hidden": True}
        )
        assert response.status_code == 200
        session.expire_all()
        clone_meta = client.get(f"/api/document/{clone_public_id}").json()[
            "map_metadata"
        ]
        assert clone_meta["draft_status"] == "scratch"

        response = client.post(
            f"/api/submissions/admin/{submission_id}/hidden", json={"hidden": False}
        )
        assert response.status_code == 200
        clone_meta = client.get(f"/api/document/{clone_public_id}").json()[
            "map_metadata"
        ]
        assert clone_meta["draft_status"] == "ready_to_share"


class TestModerationWiring:
    def test_submit_schedules_the_moderation_task(
        self, client, form_config, monkeypatch
    ):
        # The background-task wiring itself: deleting add_task from
        # create_submission must fail this test. The task is invoked with
        # the submission pk after the response is sent (TestClient runs
        # background tasks synchronously).
        calls = []
        monkeypatch.setattr(
            "app.submissions.main.moderate_submission_by_id",
            lambda submission_id, session=None: calls.append(submission_id),
        )
        response = _submit(client)
        assert response.status_code == 201, response.json()
        assert calls == [response.json()["id"]]

    def test_map_card_text_is_scored(self, client, form_config, document_id, session):
        # The gallery card renders the map's name/description — they must be
        # part of the scored text or an abusive title sails past the filter.
        _mark_ready(session, document_id)
        doc = session.exec(
            select(Document).where(col(Document.document_id) == document_id)
        ).one()
        doc.map_metadata = {**(doc.map_metadata or {}), "name": "abusive title"}
        session.add(doc)
        session.commit()

        submission_id = _submit(client, map_ref=document_id).json()["id"]
        scored = {}
        with patch(
            "app.submissions.moderation.score_text",
            side_effect=lambda text: scored.setdefault("text", text) and 0.0 or 0.0,
        ):
            moderate_submission_by_id(submission_id, session=session)
        assert "abusive title" in scored["text"]


class TestFormConfigContract:
    def test_form_config_shape(self, client, form_config):
        # Cross-service payload: the CMS and frontend both render forms from
        # this response. admin_teams is an internal moderation detail and
        # must never ship in it.
        response = client.get(f"/api/submissions/form_config?portal_id={PORTAL}")
        assert response.status_code == 200
        body = response.json()
        assert body["portal_id"] == PORTAL
        assert body["fields"] == form_config.fields
        assert body["required_fields"] == form_config.required_fields
        assert "admin_teams" not in body
        assert "id" not in body


class TestPublicListParams:
    """The public list's newly-loosened boundary: portal_id optional (cross-
    portal galleries) and an ids filter — neither may widen visibility past
    submitted + not-hidden."""

    def test_omitting_portal_id_spans_portals(self, client, form_config):
        a = _submit(client).json()["id"]
        b = _submit(client, fields={"title": "other"}, portal_id=OTHER_PORTAL).json()[
            "id"
        ]
        listed = {s["id"] for s in client.get("/api/submissions").json()}
        assert {a, b} <= listed

    def test_ids_filter_narrows(self, client, form_config):
        a = _submit(client).json()["id"]
        _submit(client, fields={"title": "other"}, portal_id=OTHER_PORTAL)
        listed = client.get(f"/api/submissions?ids={a}").json()
        assert [s["id"] for s in listed] == [a]

    def test_ids_cannot_fish_out_hidden_rows(self, client, form_config, session):
        submission_id = _submit(client).json()["id"]
        _set_auth(TEAM_A_PAYLOAD)
        response = client.post(
            f"/api/submissions/admin/{submission_id}/hidden", json={"hidden": True}
        )
        assert response.status_code == 200
        assert client.get(f"/api/submissions?ids={submission_id}").json() == []

    def test_ids_cannot_fish_out_drafts(
        self, client, form_config, ks_demo_view_census_blocks_districtrmap, session
    ):
        response = client.post(
            "/api/create_document",
            json={
                "districtr_map_slug": "ks_demo_view_census_blocks",
                "portal_id": PORTAL,
            },
        )
        assert response.status_code == 201
        draft_pk = session.exec(
            select(Submission.id).where(col(Submission.portal_id) == PORTAL)
        ).one()
        assert client.get(f"/api/submissions?ids={draft_pk}").json() == []


# ---------------------------------------------------------------------------
# Collection modes: server-side auto-finalize + internal exclusion
# ---------------------------------------------------------------------------

AUTO_PORTAL = "auto-portal"
INTERNAL_PORTAL = "internal-portal"


@pytest.fixture(name="mode_portals")
def mode_portals_fixture(session: Session, form_config):
    """One portal per auto mode, next to the prompt-mode `form_config`."""
    for portal_id, mode in (
        (AUTO_PORTAL, "auto_public"),
        (INTERNAL_PORTAL, "internal"),
    ):
        session.add(
            FormConfig(
                portal_id=portal_id,
                name=portal_id,
                fields=[],
                required_fields=[],
                admin_teams=["team-a"],
                collection_mode=mode,
            )
        )
    session.commit()


class TestAutoFinalize:
    @pytest.fixture(autouse=True)
    def _map_module(self, ks_demo_view_census_blocks_districtrmap, mode_portals):
        """create_document needs the map module; portals need configs."""

    def _create_draft(self, client, portal_id):
        response = client.post(
            "/api/create_document",
            json={"districtr_map_slug": GERRY_DB_FIXTURE_NAME, "portal_id": portal_id},
        )
        assert response.status_code == 201, response.json()
        return response.json()

    def _set_status(self, client, document_id, draft_status):
        return client.put(
            f"/api/document/{document_id}/metadata", json={"draft_status": draft_status}
        )

    def test_ready_to_share_flips_auto_draft_live_no_clone(self, client, session):
        doc = self._create_draft(client, AUTO_PORTAL)
        documents_before = len(session.exec(select(Document)).all())

        assert (
            self._set_status(client, doc["document_id"], "ready_to_share").status_code
            == 200
        )

        submission = session.exec(
            select(Submission).where(
                col(Submission.submission_id) == doc["submission_id"]
            )
        ).one()
        assert submission.status == "submitted"
        # The live map, not a clone — and no new Document row exists.
        assert submission.map_public_id == doc["public_id"]
        assert len(session.exec(select(Document)).all()) == documents_before

        # Idempotent: a second submitted-tier PUT is a no-op.
        first_submitted_at = submission.submitted_at
        assert (
            self._set_status(client, doc["document_id"], "in_progress").status_code
            == 200
        )
        session.refresh(submission)
        assert submission.submitted_at == first_submitted_at

    def test_in_progress_also_triggers(self, client, session):
        doc = self._create_draft(client, INTERNAL_PORTAL)
        assert (
            self._set_status(client, doc["document_id"], "in_progress").status_code
            == 200
        )
        submission = session.exec(
            select(Submission).where(
                col(Submission.submission_id) == doc["submission_id"]
            )
        ).one()
        assert submission.status == "submitted"

    def test_scratch_does_not_trigger(self, client, session):
        doc = self._create_draft(client, AUTO_PORTAL)
        assert (
            self._set_status(client, doc["document_id"], "scratch").status_code == 200
        )
        submission = session.exec(
            select(Submission).where(
                col(Submission.submission_id) == doc["submission_id"]
            )
        ).one()
        assert submission.status == "draft"

    def test_prompt_portal_draft_is_not_flipped(self, client, session):
        # Deliberate-submission portals keep the modal/clone flow: the
        # backend must not auto-submit their drafts.
        doc = self._create_draft(client, PORTAL)
        assert (
            self._set_status(client, doc["document_id"], "ready_to_share").status_code
            == 200
        )
        submission = session.exec(
            select(Submission).where(
                col(Submission.submission_id) == doc["submission_id"]
            )
        ).one()
        assert submission.status == "draft"


class TestInternalExclusion:
    @pytest.fixture(autouse=True)
    def _map_module(self, ks_demo_view_census_blocks_districtrmap, mode_portals):
        pass

    def _submitted_internal(self, client, session):
        response = client.post(
            "/api/create_document",
            json={
                "districtr_map_slug": GERRY_DB_FIXTURE_NAME,
                "portal_id": INTERNAL_PORTAL,
            },
        )
        doc = response.json()
        client.put(
            f"/api/document/{doc['document_id']}/metadata",
            json={"draft_status": "ready_to_share"},
        )
        return doc

    def test_internal_submissions_hidden_from_public_surfaces(self, client, session):
        doc = self._submitted_internal(client, session)

        # Public submissions list: absent (with or without portal filter).
        assert client.get("/api/submissions?portal_id=internal-portal").json() == []
        assert all(
            s["portal_id"] != INTERNAL_PORTAL
            for s in client.get("/api/submissions").json()
        )
        # Tag gallery: absent (the auto-applied portal tag would match).
        assert client.get(f"/api/documents/list?tags={INTERNAL_PORTAL}").json() == []

        # Admin list: present.
        _set_auth(TEAM_A_PAYLOAD)
        admin = client.get(f"/api/submissions/admin?portal_id={INTERNAL_PORTAL}").json()
        assert [s["map_public_id"] for s in admin] == [doc["public_id"]]
        assert admin[0]["status"] == "submitted"


# ---------------------------------------------------------------------------
# Custom fields
# ---------------------------------------------------------------------------


class TestCustomFields:
    @pytest.fixture(autouse=True)
    def _customs(self, session: Session, form_config):
        from app.submissions.models import FormFieldCustom

        session.add(
            FormFieldCustom(
                portal_id=PORTAL,
                key="custom_neighborhood",
                label="What neighborhood do you live in?",
                field_type="text",
                required=True,
                sort_order=0,
            )
        )
        session.add(
            FormFieldCustom(
                portal_id=PORTAL,
                key="custom_story",
                label="Tell us your story",
                field_type="textarea",
                required=False,
                sort_order=1,
            )
        )
        session.commit()

    def test_form_config_read_includes_mode_and_customs(self, client):
        config = client.get(f"/api/submissions/form_config?portal_id={PORTAL}").json()
        assert config["collection_mode"] == "prompt"
        assert [c["key"] for c in config["custom_fields"]] == [
            "custom_neighborhood",
            "custom_story",
        ]
        assert config["custom_fields"][0]["required"] is True
        assert config["custom_fields"][1]["field_type"] == "textarea"

    def test_missing_required_custom_reported_with_other_errors(self, client):
        response = _submit(client, fields={"bogus": "x"})
        assert response.status_code == 422
        errors = response.json()["detail"]
        assert any("custom_neighborhood" in e for e in errors)
        assert any("bogus" in e for e in errors)

    def test_custom_values_stored_and_public(self, client):
        response = _submit(
            client,
            fields={
                **VALID_FIELDS,
                "custom_neighborhood": "Hyde Park",
                "custom_story": "We moved here in 1998.",
            },
        )
        assert response.status_code == 201, response.json()
        listed = client.get(f"/api/submissions?portal_id={PORTAL}").json()
        assert listed[0]["fields"]["custom_neighborhood"] == "Hyde Park"
        assert listed[0]["fields"]["custom_story"] == "We moved here in 1998."

    def test_custom_text_length_cap(self, client):
        response = _submit(
            client,
            fields={
                **VALID_FIELDS,
                "custom_neighborhood": "x" * 300,  # text caps at 255
            },
        )
        assert response.status_code == 422
        assert any("custom_neighborhood" in e for e in response.json()["detail"])
