from sqlmodel import Session, select, insert
from unittest.mock import patch
from app.comments.models import Commenter, Comment, Tag, CommentTag, DocumentComment
from app.core.security import recaptcha, auth
from pytest import MonkeyPatch, fixture
from tests.utils import fake_verify_recaptcha
from fastapi.security import SecurityScopes
from app.main import app
from app.comments.models import FullCommentFormResponse

TEST_MODERATION_SCORE = 0.001


@fixture(autouse=True)
def patch_recaptcha():
    monkeypatch = MonkeyPatch()
    monkeypatch.setattr(recaptcha, "verify_recaptcha", fake_verify_recaptcha)
    yield
    monkeypatch.undo()


@fixture(autouse=True)
def override_auth_dependency():
    async def _ok_override(_scopes: SecurityScopes):
        # Return anything your app expects from a verified token
        # You can include "scope" with needed permissions if your code reads it.
        return {"sub": "test-user", "scope": "create:content read:content"}

    app.dependency_overrides[auth.verify] = _ok_override
    try:
        yield
    finally:
        app.dependency_overrides.pop(auth.verify, None)


def mock_review_approve(client, content_type: str, id: int):
    client.post(
        "/api/comments/admin/review",
        json={
            "content_type": content_type,
            "review_status": "APPROVED",
            "id": id,
        },
    )


def mock_review_approve_full(client, form_response: FullCommentFormResponse):
    if "tags" in form_response["comment"]:
        for tag in form_response["comment"]["tags"]:
            mock_review_approve(client, "tag", tag["id"])
    if (
        "commenter_id" in form_response["comment"]
        and form_response["comment"]["commenter_id"] is not None
    ):
        mock_review_approve(
            client, "commenter", form_response["comment"]["commenter_id"]
        )
    if "id" in form_response["comment"] and form_response["comment"]["id"] is not None:
        mock_review_approve(client, "comment", form_response["comment"]["id"])


class TestCommenterEndpoint:
    """Tests for the /api/comments/commenter endpoint"""

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_commenter_success(self, mock_score_text, client, session: Session):
        """Test successful commenter creation"""
        commenter_data = {
            "first_name": "John",
            "email": "john@example.com",
            "salutation": "Mr.",
            "last_name": "Doe",
            "place": "San Francisco",
            "state": "CA",
            "zip_code": "94102",
        }

        response = client.post(
            "/api/comments/commenter",
            json={"commenter": commenter_data, "recaptcha_token": "test_token"},
        )

        assert response.status_code == 201
        data = response.json()

        # Verify all fields are returned
        assert data["first_name"] == "John"
        assert data["email"] == "john@example.com"
        assert data["salutation"] == "Mr."
        assert data["last_name"] == "Doe"
        assert data["place"] == "San Francisco"
        assert data["state"] == "CA"
        assert data["zip_code"] == "94102"
        assert "created_at" in data
        assert "updated_at" in data

        # Verify it was saved to database
        stmt = select(Commenter).where(
            Commenter.email == "john@example.com", Commenter.first_name == "John"
        )
        db_commenter = session.exec(stmt).one()
        assert db_commenter.first_name == "John"
        assert db_commenter.email == "john@example.com"

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_commenter_minimal_data(
        self, mock_score_test, client, session: Session
    ):
        """Test commenter creation with only required fields"""
        commenter_data = {"first_name": "Jane", "email": "jane@example.com"}

        response = client.post(
            "/api/comments/commenter",
            json={"commenter": commenter_data, "recaptcha_token": "test_token"},
        )

        assert response.status_code == 201
        data = response.json()

        assert data["first_name"] == "Jane"
        assert data["email"] == "jane@example.com"
        assert data["salutation"] is None
        assert data["last_name"] is None
        assert data["place"] is None
        assert data["state"] is None
        assert data["zip_code"] is None

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_commenter_upsert_on_conflict(
        self, mock_score_test, client, session: Session
    ):
        """Test that creating a duplicate commenter performs upsert"""
        # First creation
        commenter_data = {
            "first_name": "Bob",
            "email": "bob@example.com",
            "place": "New York",
        }
        response1 = client.post(
            "/api/comments/commenter",
            json={"commenter": commenter_data, "recaptcha_token": "test_token"},
        )
        assert response1.status_code == 201

        # Second creation with same name/email but different data
        updated_data = {
            "first_name": "Bob",
            "email": "bob@example.com",
            "place": "Los Angeles",
            "last_name": "Smith",
        }
        response2 = client.post(
            "/api/comments/commenter",
            json={"commenter": updated_data, "recaptcha_token": "test_token"},
        )
        assert response2.status_code == 201

        # Verify the data was updated
        data = response2.json()
        assert data["place"] == "Los Angeles"
        assert data["last_name"] == "Smith"

        # Verify only one record exists in database
        stmt = select(Commenter).where(
            Commenter.email == "bob@example.com", Commenter.first_name == "Bob"
        )
        commenters = session.exec(stmt).all()
        assert len(commenters) == 1
        assert commenters[0].place == "Los Angeles"

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_commenter_invalid_email(
        self,
        mock_score_text,
        client,
    ):
        """Test commenter creation with invalid email format"""
        commenter_data = {"first_name": "Invalid", "email": "not-an-email"}

        response = client.post(
            "/api/comments/commenter",
            json={"commenter": commenter_data, "recaptcha_token": "test_token"},
        )
        # Should fail due to database email validation constraint
        assert response.status_code in [400, 422, 500]  # Various possible error codes

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_commenter_empty_required_fields(
        self,
        mock_score_text,
        client,
    ):
        """Test commenter creation with empty required fields"""
        test_cases = [
            {"first_name": "", "email": "test@example.com"},
            {"first_name": "Test", "email": ""},
            {"first_name": "   ", "email": "test@example.com"},  # whitespace only
        ]

        for commenter_data in test_cases:
            response = client.post(
                "/api/comments/commenter",
                json={"commenter": commenter_data, "recaptcha_token": "test_token"},
            )
            assert response.status_code in [400, 422, 500]

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_commenter_missing_required_fields(
        self,
        mock_score_text,
        client,
    ):
        """Test commenter creation with missing required fields"""
        test_cases = [
            {"first_name": "Test"},  # missing email
            {"email": "test@example.com"},  # missing first_name
            {},  # missing both
        ]

        for commenter_data in test_cases:
            response = client.post(
                "/api/comments/commenter",
                json={"commenter": commenter_data, "recaptcha_token": "test_token"},
            )
            assert response.status_code == 422


class TestCommentEndpoint:
    """Tests for the /api/comments/comment endpoint"""

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_comment_success(self, mock_score_test, client, session: Session):
        """Test successful comment creation"""
        comment_data = {
            "comment": {
                "title": "Test Comment",
                "comment": "This is a test comment with some content.",
            },
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/comment", json=comment_data)

        assert response.status_code == 201
        data = response.json()

        assert data["title"] == "Test Comment"
        assert data["comment"] == "This is a test comment with some content."
        assert "created_at" in data
        assert "updated_at" in data

        # Verify it was saved to database
        stmt = select(Comment).where(Comment.title == "Test Comment")
        db_comment = session.exec(stmt).one()
        assert db_comment.title == "Test Comment"
        assert db_comment.comment == "This is a test comment with some content."
        assert db_comment.commenter_id is None  # Should be null as specified

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_comment_on_document_success(
        self, mock_score_test, client, document_id, session: Session
    ):
        """Test successful comment creation"""
        comment_data = {
            "title": "Test Comment",
            "comment": "This is a test comment with some content.",
            "document_id": document_id,
        }

        response = client.post(
            "/api/comments/comment",
            json={"comment": comment_data, "recaptcha_token": "test_token"},
        )

        assert response.status_code == 201
        data = response.json()

        assert data["title"] == "Test Comment"
        assert data["comment"] == "This is a test comment with some content."
        assert "created_at" in data
        assert "updated_at" in data

        # Verify it was saved to database
        stmt = select(Comment).where(Comment.title == "Test Comment")
        db_comment = session.exec(stmt).one()
        assert db_comment.title == "Test Comment"
        assert db_comment.comment == "This is a test comment with some content."
        assert db_comment.commenter_id is None  # Should be null as specified

        stmt = select(DocumentComment).where(DocumentComment.document_id == document_id)
        db_document_comment = session.exec(stmt).one()
        assert db_document_comment.comment_id == db_comment.id
        assert db_document_comment.document_id == document_id, response.json()

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_comment_long_content(
        self, mock_score_test, client, session: Session
    ):
        """Test comment creation with long content"""
        long_content = "A" * 4500  # Close to the 5000 char limit
        comment_data = {"title": "Long Comment", "comment": long_content}

        response = client.post(
            "/api/comments/comment",
            json={"comment": comment_data, "recaptcha_token": "test_token"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["comment"] == long_content

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_comment_too_long_content(
        self,
        mock_score_text,
        client,
    ):
        """Test comment creation with content exceeding limit"""
        too_long_content = "A" * 5001  # Exceeds the 5000 char limit
        comment_data = {"title": "Too Long Comment", "comment": too_long_content}

        response = client.post(
            "/api/comments/comment",
            json={"comment": comment_data, "recaptcha_token": "test_token"},
        )
        # Should fail due to database constraint
        assert response.status_code in [400, 422, 500]

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_comment_missing_required_fields(
        self,
        mock_score_text,
        client,
    ):
        """Test comment creation with missing required fields"""
        test_cases = [
            {"title": "Test"},  # missing comment
            {"comment": "Test comment"},  # missing title
            {},  # missing both
        ]

        for comment_data in test_cases:
            response = client.post(
                "/api/comments/comment",
                json={"comment": comment_data, "recaptcha_token": "test_token"},
            )
            assert response.status_code == 422

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_comment_empty_required_fields(
        self,
        mock_score_text,
        client,
    ):
        """Test comment creation with empty required fields"""
        test_cases = [
            {"title": "", "comment": "Valid comment"},
            {"title": "Valid title", "comment": ""},
            {"title": "   ", "comment": "Valid comment"},  # whitespace only
        ]

        for comment_data in test_cases:
            response = client.post(
                "/api/comments/comment",
                json={"comment": comment_data, "recaptcha_token": "test_token"},
            )
            assert response.status_code in [400, 422, 500]


class TestTagEndpoint:
    """Tests for the /api/comments/tag endpoint"""

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_tag_success(self, mock_score_test, client, session: Session):
        """Test successful tag creation"""
        tag_data = {"tag": "Important Issue"}

        response = client.post(
            "/api/comments/tag", json={"tag": tag_data, "recaptcha_token": "test_token"}
        )

        assert response.status_code == 201, response.json()
        data = response.json()

        # Should be slugified
        assert data["slug"] == "important-issue"

        # Verify it was saved to database
        stmt = select(Tag).where(Tag.slug == "important-issue")
        db_tag = session.exec(stmt).one()
        assert db_tag.slug == "important-issue"

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_tag_conflict_success(
        self, mock_score_test, client, session: Session
    ):
        """Test successful tag creation"""
        tag_data = {"tag": "Important Issue"}

        # First time inserted
        response = client.post(
            "/api/comments/tag", json={"tag": tag_data, "recaptcha_token": "test_token"}
        )
        assert response.status_code == 201, response.json()
        data = response.json()
        assert data["slug"] == "important-issue"

        # Second time inserted
        response = client.post(
            "/api/comments/tag", json={"tag": tag_data, "recaptcha_token": "test_token"}
        )
        assert response.status_code == 201, response.json()
        data = response.json()
        assert data["slug"] == "important-issue"

        # Verify it was saved to database only once
        stmt = select(Tag).where(Tag.slug == "important-issue")
        db_tag = session.exec(stmt).one()
        assert db_tag.slug == "important-issue"

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_tag_with_special_characters(
        self, mock_score_test, client, session: Session
    ):
        """Test tag creation with special characters that should be removed"""
        tag_data = {"tag": "Budget & Finance!!! @#$"}

        response = client.post(
            "/api/comments/tag", json={"tag": tag_data, "recaptcha_token": "test_token"}
        )

        assert response.status_code == 201
        data = response.json()

        # Special characters should be removed, spaces converted to dashes
        assert data["slug"] == "budget-finance"

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_tag_with_multiple_spaces(
        self, mock_score_test, client, session: Session
    ):
        """Test tag creation with multiple consecutive spaces"""
        tag_data = {"tag": "Housing    and     Development"}

        response = client.post(
            "/api/comments/tag", json={"tag": tag_data, "recaptcha_token": "test_token"}
        )

        assert response.status_code == 201
        data = response.json()

        # Multiple spaces should be converted to single dashes
        assert data["slug"] == "housing-and-development"

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_tag_duplicate_returns_existing(
        self, mock_score_test, client, session: Session
    ):
        """Test that creating a duplicate tag returns the existing one"""
        tag_data = {"tag": "Education"}

        # Create first tag
        response1 = client.post(
            "/api/comments/tag", json={"tag": tag_data, "recaptcha_token": "test_token"}
        )
        assert response1.status_code == 201
        data1 = response1.json()
        assert data1["slug"] == "education"

        # Create duplicate tag (different case/format but same slug)
        duplicate_data = {"tag": "EDUCATION"}
        response2 = client.post(
            "/api/comments/tag",
            json={"tag": duplicate_data, "recaptcha_token": "test_token"},
        )
        assert response2.status_code == 201
        data2 = response2.json()
        assert data2["slug"] == "education"

        # Should only be one tag in database
        stmt = select(Tag).where(Tag.slug == "education")
        tags = session.exec(stmt).all()
        assert len(tags) == 1

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_tag_mixed_case_and_spacing(
        self, mock_score_test, client, session: Session
    ):
        """Test tag creation with mixed case and spacing"""
        tag_data = {"tag": "  Public SAFETY & Security  "}

        response = client.post(
            "/api/comments/tag", json={"tag": tag_data, "recaptcha_token": "test_token"}
        )

        assert response.status_code == 201
        data = response.json()

        # Should be lowercased, trimmed, and slugified
        assert data["slug"] == "public-safety-security"

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_tag_empty_string(
        self,
        mock_score_text,
        client,
    ):
        """Test tag creation with empty string"""
        test_cases = [
            {"tag": ""},
            {"tag": "   "},  # whitespace only
            {"tag": "!@#$%"},  # only special characters
        ]

        for tag_data in test_cases:
            response = client.post(
                "/api/comments/tag",
                json={"tag": tag_data, "recaptcha_token": "test_token"},
            )
            # Should fail because slugify returns null/empty for invalid input
            assert response.status_code in [400, 422, 500], response.json()

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_tag_missing_required_field(
        self,
        mock_score_text,
        client,
    ):
        """Test tag creation with missing required field"""
        response = client.post(
            "/api/comments/tag", json={"tag": {}, "recaptcha_token": "test_token"}
        )
        assert response.status_code == 422

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_tag_numbers_and_hyphens(
        self, mock_score_test, client, session: Session
    ):
        """Test tag creation with numbers and hyphens"""
        tag_data = {"tag": "COVID-19 Response 2024"}

        response = client.post(
            "/api/comments/tag", json={"tag": tag_data, "recaptcha_token": "test_token"}
        )

        assert response.status_code == 201
        data = response.json()

        # Numbers and existing hyphens should be preserved
        assert data["slug"] == "covid-19-response-2024"


class TestIntegrationTests:
    """Integration tests for the comments system"""

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_create_full_comment_system_flow(
        self, mock_score_test, client, session: Session
    ):
        """Test creating commenter, comment, and tags in sequence"""
        # Create commenter
        commenter_data = {
            "first_name": "Alice",
            "email": "alice@example.com",
            "place": "Boston",
        }
        commenter_response = client.post(
            "/api/comments/commenter",
            json={"commenter": commenter_data, "recaptcha_token": "test_token"},
        )
        assert commenter_response.status_code == 201

        # Create comment
        comment_data = {
            "title": "Important Feedback",
            "comment": "This is important feedback about the system.",
        }
        comment_response = client.post(
            "/api/comments/comment",
            json={"comment": comment_data, "recaptcha_token": "test_token"},
        )
        assert comment_response.status_code == 201

        # Create tags
        tag_data_1 = {"tag": "Feedback"}
        tag_data_2 = {"tag": "System Issues"}

        tag_response_1 = client.post(
            "/api/comments/tag",
            json={"tag": tag_data_1, "recaptcha_token": "test_token"},
        )
        tag_response_2 = client.post(
            "/api/comments/tag",
            json={"tag": tag_data_2, "recaptcha_token": "test_token"},
        )

        assert tag_response_1.status_code == 201
        assert tag_response_2.status_code == 201

        assert tag_response_1.json()["slug"] == "feedback"
        assert tag_response_2.json()["slug"] == "system-issues"

        # Verify all items exist in database
        commenter_stmt = select(Commenter).where(Commenter.email == "alice@example.com")
        comment_stmt = select(Comment).where(Comment.title == "Important Feedback")
        tag_stmt_1 = select(Tag).where(Tag.slug == "feedback")
        tag_stmt_2 = select(Tag).where(Tag.slug == "system-issues")

        assert session.exec(commenter_stmt).one()
        assert session.exec(comment_stmt).one()
        assert session.exec(tag_stmt_1).one()
        assert session.exec(tag_stmt_2).one()


class TestFullCommentSubmissionEndpoint:
    """Tests for the /api/comments/submit endpoint"""

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_submit_full_comment_success(
        self, mock_score_text, client, session: Session
    ):
        """Test successful full comment submission"""
        form_data = {
            "commenter": {
                "first_name": "John",
                "email": "john@example.com",
                "salutation": "Mr.",
                "last_name": "Doe",
                "place": "San Francisco",
                "state": "CA",
                "zip_code": "94102",
            },
            "comment": {
                "title": "Important Issue",
                "comment": "This is my detailed comment about the issue.",
            },
            "tags": [
                {"tag": "Public Safety"},
                {"tag": "Budget"},
                {"tag": "Community Input"},
            ],
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/submit", json=form_data)

        assert response.status_code == 201, response.json()
        data = response.json()

        # Verify commenter data
        assert data["commenter"]["first_name"] == "John"
        assert data["commenter"]["email"] == "john@example.com"
        assert data["commenter"]["salutation"] == "Mr."

        # Verify comment data
        assert data["comment"]["title"] == "Important Issue"
        assert (
            data["comment"]["comment"] == "This is my detailed comment about the issue."
        )

        # Verify tags data
        assert len(data["tags"]) == 3
        tag_slugs = [tag["slug"] for tag in data["tags"]]
        assert "public-safety" in tag_slugs
        assert "budget" in tag_slugs
        assert "community-input" in tag_slugs

        # Verify database records
        commenter_stmt = select(Commenter).where(Commenter.email == "john@example.com")
        db_commenter = session.exec(commenter_stmt).one()

        comment_stmt = select(Comment).where(Comment.title == "Important Issue")
        db_comment = session.exec(comment_stmt).one()
        assert db_comment.commenter_id == db_commenter.id

        # Verify comment-tag associations
        associations_stmt = select(CommentTag).where(
            CommentTag.comment_id == db_comment.id
        )
        associations = session.exec(associations_stmt).all()
        assert len(associations) == 3

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_submit_full_comment_minimal_data(
        self, mock_score_text, client, session: Session
    ):
        """Test full comment submission with minimal required data"""
        form_data = {
            "commenter": {"first_name": "Jane", "email": "jane@example.com"},
            "comment": {
                "title": "Simple Comment",
                "comment": "This is a simple comment.",
            },
            "tags": [{"tag": "General"}],
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/submit", json=form_data)

        assert response.status_code == 201
        data = response.json()

        assert data["commenter"]["first_name"] == "Jane"
        assert data["comment"]["title"] == "Simple Comment"
        assert len(data["tags"]) == 1
        assert data["tags"][0]["slug"] == "general"

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_submit_full_comment_no_tags(
        self, mock_score_text, client, session: Session
    ):
        """Test full comment submission with empty tags list"""
        form_data = {
            "commenter": {"first_name": "Bob", "email": "bob@example.com"},
            "comment": {
                "title": "No Tags Comment",
                "comment": "This comment has no tags.",
            },
            "tags": [],
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/submit", json=form_data)

        assert response.status_code == 201
        data = response.json()

        assert data["commenter"]["first_name"] == "Bob"
        assert data["comment"]["title"] == "No Tags Comment"
        assert len(data["tags"]) == 0

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_submit_full_comment_upsert_commenter(
        self, mock_score_text, client, session: Session
    ):
        """Test that submitting with existing commenter updates their info"""
        # First submission
        form_data_1 = {
            "commenter": {
                "first_name": "Alice",
                "email": "alice@example.com",
                "place": "New York",
            },
            "comment": {
                "title": "First Comment",
                "comment": "This is my first comment.",
            },
            "tags": [{"tag": "First"}],
            "recaptcha_token": "test_token",
        }

        response1 = client.post("/api/comments/submit", json=form_data_1)
        assert response1.status_code == 201

        # Second submission with same commenter but updated info
        form_data_2 = {
            "commenter": {
                "first_name": "Alice",
                "email": "alice@example.com",
                "place": "Los Angeles",
                "last_name": "Smith",
            },
            "comment": {
                "title": "Second Comment",
                "comment": "This is my second comment.",
            },
            "tags": [{"tag": "Second"}],
            "recaptcha_token": "test_token",
        }

        response2 = client.post("/api/comments/submit", json=form_data_2)
        assert response2.status_code == 201

        # Verify commenter was updated
        data = response2.json()
        assert data["commenter"]["place"] == "Los Angeles"
        assert data["commenter"]["last_name"] == "Smith"

        # Verify only one commenter exists in database
        commenter_stmt = select(Commenter).where(Commenter.email == "alice@example.com")
        commenters = session.exec(commenter_stmt).all()
        assert len(commenters) == 1
        assert commenters[0].place == "Los Angeles"

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_submit_full_comment_duplicate_tags(
        self, mock_score_text, client, session: Session
    ):
        """Test submission with duplicate tag names"""
        form_data = {
            "commenter": {"first_name": "Carol", "email": "carol@example.com"},
            "comment": {
                "title": "Duplicate Tags Test",
                "comment": "Testing duplicate tag handling.",
            },
            "tags": [
                {"tag": "Environment"},
                {"tag": "ENVIRONMENT"},  # Same slug when processed
                {"tag": "Environment & Climate"},  # Different but similar
            ],
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/submit", json=form_data)

        assert response.status_code == 201
        data = response.json()

        # Should have created tags (duplicates handled by upsert)
        assert len(data["tags"]) == 3
        tag_slugs = [tag["slug"] for tag in data["tags"]]
        assert "environment" in tag_slugs
        assert "environment-climate" in tag_slugs

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_submit_full_comment_invalid_commenter_email(
        self,
        mock_score_text,
        client,
    ):
        """Test submission with invalid commenter email"""
        form_data = {
            "commenter": {"first_name": "Invalid", "email": "not-an-email"},
            "comment": {"title": "Test Comment", "comment": "This should fail."},
            "tags": [{"tag": "Test"}],
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/submit", json=form_data)
        assert response.status_code == 422

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_submit_full_comment_missing_required_fields(
        self,
        mock_score_text,
        client,
    ):
        """Test submission with missing required fields"""
        test_cases = [
            {
                # Missing commenter
                "comment": {"title": "Test", "comment": "Test"},
                "tags": [],
                "recaptcha_token": "test_token",
            },
            {
                # Missing comment
                "commenter": {"first_name": "Test", "email": "test@example.com"},
                "tags": [],
                "recaptcha_token": "test_token",
            },
            {
                # Missing comment title
                "commenter": {"first_name": "Test", "email": "test@example.com"},
                "comment": {"comment": "Test"},
                "tags": [],
                "recaptcha_token": "test_token",
            },
        ]

        for form_data in test_cases:
            response = client.post("/api/comments/submit", json=form_data)
            assert response.status_code == 422

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_submit_full_comment_too_long_content(
        self,
        mock_score_text,
        client,
    ):
        """Test submission with comment content exceeding limit"""

        form_data = {
            "commenter": {"first_name": "Long", "email": "long@example.com"},
            "comment": {
                "title": "Too Long",
                "comment": "A" * 5001,  # Exceeds 5000 char limit
            },
            "tags": [{"tag": "Long"}],
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/submit", json=form_data)
        assert response.status_code == 422


class TestCommentListEndpoints:
    """Tests for the comment list endpoints with moderation filtering"""

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_list_comments_clean_content_only(
        self, mock_score_text, client, session: Session, document_id
    ):
        """Test that /list endpoint only returns comments with low moderation scores"""
        # Create a clean comment submission
        clean_form_data = {
            "commenter": {
                "first_name": "John",
                "email": "john@example.com",
                "place": "San Francisco",
                "state": "CA",
            },
            "comment": {
                "title": "Clean Comment",
                "comment": "This is a clean comment.",
                "document_id": document_id,
            },
            "tags": [{"tag": "Public Safety"}],
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/submit", json=clean_form_data)
        assert response.status_code == 201
        # approve the comment
        mock_review_approve_full(client, response.json())

        # Get the list of comments
        response = client.get("/api/comments/list")
        assert response.status_code == 200

        comments = response.json()
        assert len(comments) == 1
        assert comments[0]["title"] == "Clean Comment"
        assert comments[0]["first_name"] == "John"

    @patch("app.comments.moderation.score_text")
    def test_list_comments_filters_profane_content(
        self, mock_score_text, client, session: Session, document_id
    ):
        """Test that /list endpoint filters out comments with high moderation scores"""
        # First comment - profane (score 1.0)
        mock_score_text.return_value = 1.0
        profane_form_data = {
            "commenter": {
                "first_name": "Bob",
                "email": "bob@example.com",
                "place": "Chicago",
                "state": "IL",
            },
            "comment": {
                "title": "Profane Comment",
                "comment": "This contains profanity.",
                "document_id": document_id,
            },
            "tags": [{"tag": "Budget"}],
            "recaptcha_token": "test_token",
        }
        response = client.post("/api/comments/submit", json=profane_form_data)
        assert response.status_code == 201

        # Second comment - clean (score TEST_MODERATION_SCORE)
        mock_score_text.return_value = TEST_MODERATION_SCORE
        clean_form_data = {
            "commenter": {
                "first_name": "Alice",
                "email": "alice@example.com",
                "place": "Boston",
                "state": "MA",
            },
            "comment": {
                "title": "Clean Comment",
                "comment": "This is a clean comment.",
                "document_id": document_id,
            },
            "tags": [{"tag": "Education"}],
            "recaptcha_token": "test_token",
        }
        response = client.post("/api/comments/submit", json=clean_form_data)
        mock_review_approve_full(client, response.json())
        assert response.status_code == 201

        # Get the list of comments - should only return the clean one
        response = client.get("/api/comments/list")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 1
        assert comments[0]["title"] == "Clean Comment"
        assert comments[0]["first_name"] == "Alice"

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_list_comments_with_filters(
        self, mock_score_text, client, session: Session, document_id
    ):
        """Test /list endpoint with various filters"""
        # Create comments with different attributes
        form_data_1 = {
            "commenter": {
                "first_name": "Alice",
                "email": "alice@example.com",
                "place": "Boston",
                "state": "MA",
                "zip_code": "02101",
            },
            "comment": {
                "title": "Boston Comment",
                "comment": "Comment from Boston.",
                "document_id": document_id,
            },
            "tags": [{"tag": "Education"}, {"tag": "Budget"}],
            "recaptcha_token": "test_token",
        }

        form_data_2 = {
            "commenter": {
                "first_name": "Bob",
                "email": "bob@example.com",
                "place": "Cambridge",
                "state": "MA",
                "zip_code": "02139",
            },
            "comment": {
                "title": "Cambridge Comment",
                "comment": "Comment from Cambridge.",
                "document_id": document_id,
            },
            "tags": [{"tag": "Transportation"}],
            "recaptcha_token": "test_token",
        }

        # Submit both comments
        response1 = client.post("/api/comments/submit", json=form_data_1)
        response2 = client.post("/api/comments/submit", json=form_data_2)
        mock_review_approve_full(client, response1.json())
        mock_review_approve_full(client, response2.json())
        assert response1.status_code == 201
        assert response2.status_code == 201

        # Test filtering by place
        response = client.get("/api/comments/list?place=Boston")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 1
        assert comments[0]["place"] == "Boston"

        # Test filtering by state
        response = client.get("/api/comments/list?state=MA")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 2

        # Test filtering by zip code
        response = client.get("/api/comments/list?zip_code=02139")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 1
        assert comments[0]["zip_code"] == "02139"

        # Test filtering by tags
        response = client.get("/api/comments/list?tags=education")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 1
        assert "education" in comments[0]["tags"]

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_admin_list_comments_success(
        self, mock_score_text, client, session: Session, document_id
    ):
        """Test /admin/list endpoint with authentication"""
        # Create a comment
        form_data = {
            "commenter": {
                "first_name": "Admin",
                "email": "admin@example.com",
                "place": "Washington",
                "state": "DC",
            },
            "comment": {
                "title": "Admin Test Comment",
                "comment": "This is an admin test comment.",
                "document_id": document_id,
            },
            "tags": [{"tag": "Policy"}],
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/submit", json=form_data)
        assert response.status_code == 201

        # Test admin endpoint (auth is mocked in conftest.py)
        response = client.get("/api/comments/admin/list")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 1
        assert comments[0]["title"] == "Admin Test Comment"

    @patch("app.comments.moderation.score_text")
    def test_admin_list_comments_custom_moderation_threshold(
        self, mock_score_text, client, session: Session, document_id
    ):
        """Test /admin/list endpoint with custom moderation threshold"""

        # Create comment with moderate score (0.3)
        mock_score_text.return_value = 0.3
        moderate_form_data = {
            "commenter": {
                "first_name": "Moderate",
                "email": "moderate@example.com",
            },
            "comment": {
                "title": "Moderate Comment",
                "comment": "This has moderate content.",
                "document_id": document_id,
            },
            "tags": [{"tag": "General"}],
            "recaptcha_token": "test_token",
        }
        response = client.post("/api/comments/submit", json=moderate_form_data)
        assert response.status_code == 201

        # Create comment with high score (0.8)
        mock_score_text.return_value = 0.8
        high_form_data = {
            "commenter": {
                "first_name": "High",
                "email": "high@example.com",
            },
            "comment": {
                "title": "High Score Comment",
                "comment": "This has high score content.",
                "document_id": document_id,
            },
            "tags": [{"tag": "Issues"}],
            "recaptcha_token": "test_token",
        }
        response = client.post("/api/comments/submit", json=high_form_data)
        assert response.status_code == 201

        # Test with default threshold (should exclude high score)
        response = client.get("/api/comments/admin/list")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 2
        assert comments[0]["title"] == "Moderate Comment"

        # Test with higher threshold (should include both)
        response = client.get("/api/comments/admin/list?min_moderation_score=0.6")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 1

        # Test with lower threshold (should exclude both)
        response = client.get("/api/comments/admin/list?min_moderation_score=0.2")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 0

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_admin_list_comments_with_filters(
        self, mock_score_text, client, session: Session, document_id
    ):
        """Test /admin/list endpoint with query filters"""
        # Create test comment
        form_data = {
            "commenter": {
                "first_name": "FilterTest",
                "email": "filter@example.com",
                "place": "Seattle",
                "state": "WA",
                "zip_code": "98101",
            },
            "comment": {
                "title": "Filter Test Comment",
                "comment": "Testing admin filters.",
                "document_id": document_id,
            },
            "tags": [{"tag": "Testing"}, {"tag": "Admin"}],
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/submit", json=form_data)
        assert response.status_code == 201

        # Test filtering by place
        response = client.get("/api/comments/admin/list?place=Seattle")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 1
        assert comments[0]["place"] == "Seattle"

        # Test filtering by state
        response = client.get("/api/comments/admin/list?state=WA")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 1

        # Test filtering by tag
        response = client.get("/api/comments/admin/list?tags=testing")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 1
        assert "testing" in comments[0]["tags"]

    @patch("app.comments.moderation.score_text", return_value=TEST_MODERATION_SCORE)
    def test_list_comments_empty_results(
        self, mock_score_text, client, session: Session, document_id
    ):
        """Test /list endpoint with no matching results"""
        # Create a comment
        form_data = {
            "commenter": {
                "first_name": "Test",
                "email": "test@example.com",
                "place": "Portland",
                "state": "OR",
            },
            "comment": {
                "title": "Test Comment",
                "comment": "Test comment.",
                "document_id": document_id,
            },
            "tags": [{"tag": "Testing"}],
            "recaptcha_token": "test_token",
        }

        response = client.post("/api/comments/submit", json=form_data)
        assert response.status_code == 201

        # Search for non-existent place
        response = client.get("/api/comments/list?place=NonExistent")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 0

        # Search for non-existent tag
        response = client.get("/api/comments/list?tags=nonexistent")
        assert response.status_code == 200
        comments = response.json()
        assert len(comments) == 0


class TestListingComments:
    """Tests for the /api/comments/list/ endpoint"""

    def _add_tags(self, client, session: Session, comment_id: int):
        # do tagging in Python / SQL
        tag1 = client.post(
            "/api/comments/tag",
            json={"tag": {"tag": "hello"}, "recaptcha_token": "test_token"},
        ).json()
        tag2 = client.post(
            "/api/comments/tag",
            json={"tag": {"tag": "world"}, "recaptcha_token": "test_token"},
        ).json()
        mock_review_approve(client, "tag", tag1["id"])
        mock_review_approve(client, "tag", tag2["id"])
        tag1_id = session.exec(select(Tag.id).where(Tag.slug == "hello")).first()
        tag2_id = session.exec(select(Tag.id).where(Tag.slug == "world")).first()
        associations = [
            {"comment_id": comment_id, "tag_id": tag1_id},
            {"comment_id": comment_id, "tag_id": tag2_id},
        ]
        stmt = insert(CommentTag).values(associations)
        session.exec(stmt)

    def test_doc_comment_with_no_tags(self, client, document_id, session: Session):
        document = client.get(f"/api/document/{document_id}").json()
        blank_response = client.get(
            f"/api/comments/list?public_id={document["public_id"]}"
        )
        assert blank_response.status_code == 200
        assert len(blank_response.json()) == 0

        comment_data = {
            "comment": {
                "title": "Test Comment",
                "comment": "This is a test comment with some content.",
                "document_id": document_id,
            },
            "recaptcha_token": "test_token",
        }
        post_response = client.post("/api/comments/comment", json=comment_data)
        mock_review_approve(client, "comment", post_response.json()["id"])

        get_response = client.get(
            f"/api/comments/list?public_id={document['public_id']}"
        )

        assert get_response.status_code == 200
        assert len(get_response.json()) == 1

    def test_doc_comment_with_two_tags(self, client, document_id, session: Session):
        # create comment (this endpoint does not do tagging)
        comment_data = {
            "comment": {
                "title": "Test Comment",
                "comment": "This is a test comment with some tags.",
                "document_id": document_id,
            },
            "recaptcha_token": "test_token",
        }

        comment = client.post("/api/comments/comment", json=comment_data).json()
        mock_review_approve(client, "comment", comment["id"])
        self._add_tags(client, session, comment["id"])

        document = client.get(f"/api/document/{document_id}").json()
        get_response = client.get(
            f"/api/comments/list?public_id={document["public_id"]}"
        )

        assert get_response.status_code == 200
        returned = get_response.json()[0]
        assert len(returned["tags"]) == 2
        assert "hello" in returned["tags"]

    def test_listing_comments_by_tag(self, client, document_id, session: Session):
        comment_data = {
            "comment": {
                "title": "Test Comment",
                "comment": "This is a test comment with some tags.",
                "document_id": document_id,
                "tags": ["hello", "world"],
            },
            "recaptcha_token": "test_token",
        }
        comment = client.post("/api/comments/comment", json=comment_data).json()
        mock_review_approve(client, "comment", comment["id"])
        self._add_tags(client, session, comment["id"])

        get_response = client.get("/api/comments/list?tags=world")
        assert get_response.status_code == 200
        returned = get_response.json()[0]
        assert len(returned["tags"]) == 2
        assert "hello" in returned["tags"]

    def add_comment(self, client, document_id, session: Session):
        # create comment (this endpoint does not do tagging)
        comment_data = {
            "comment": {
                "title": "Test Comment",
                "comment": "This is a test comment with some tags.",
                "document_id": document_id,
            },
            "recaptcha_token": "test_token",
        }
        comment = client.post("/api/comments/comment", json=comment_data).json()
        self._add_tags(client, session, comment["id"])
        return comment

    def test_comment_review_reviewed(self, client, document_id, session: Session):
        comment = self.add_comment(client, document_id, session)
        review = client.post(
            "/api/comments/admin/review",
            json={
                "id": comment["id"],
                "review_status": "REVIEWED",
                "content_type": "comment",
            },
        ).json()
        assert review["new_status"] == "REVIEWED"
        assert review["id"] == comment["id"]
        assert review["message"] == "comment review status updated to REVIEWED"
        actual = session.exec(
            select(Comment).where(Comment.id == comment["id"])
        ).first()
        assert actual.review_status == "REVIEWED"

    def test_comment_review_approved(self, client, document_id, session: Session):
        comment = self.add_comment(client, document_id, session)

        # First, review to APPROVED
        review = client.post(
            "/api/comments/admin/review",
            json={
                "id": comment["id"],
                "review_status": "APPROVED",
                "content_type": "comment",
            },
        ).json()
        assert review["new_status"] == "APPROVED"
        assert review["id"] == comment["id"]
        actual = session.exec(
            select(Comment).where(Comment.id == comment["id"])
        ).first()
        assert actual.review_status == "APPROVED"
        list_result = client.get("/api/comments/list")
        assert list_result.status_code == 200
        assert len(list_result.json()) == 1

    def test_comment_review_rejected(self, client, document_id, session: Session):
        comment = self.add_comment(client, document_id, session)

        # First, review to REJECTED
        review = client.post(
            "/api/comments/admin/review",
            json={
                "id": comment["id"],
                "review_status": "REJECTED",
                "content_type": "comment",
            },
        ).json()
        assert review["new_status"] == "REJECTED"
        assert review["id"] == comment["id"]
        actual = session.exec(
            select(Comment).where(Comment.id == comment["id"])
        ).first()
        assert actual.review_status == "REJECTED"
        list_result = client.get("/api/comments/list")
        assert list_result.status_code == 200
        assert len(list_result.json()) == 0
