from sqlmodel import Session, select
from unittest.mock import patch
from app.comments.models import Commenter, Comment, Tag, CommentTag, DocumentComment


class TestCommenterEndpoint:
    """Tests for the /api/comments/commenter endpoint"""

    def test_create_commenter_success(self, client, session: Session):
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

        response = client.post("/api/comments/commenter", json=commenter_data)

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

    def test_create_commenter_minimal_data(self, client, session: Session):
        """Test commenter creation with only required fields"""
        commenter_data = {"first_name": "Jane", "email": "jane@example.com"}

        response = client.post("/api/comments/commenter", json=commenter_data)

        assert response.status_code == 201
        data = response.json()

        assert data["first_name"] == "Jane"
        assert data["email"] == "jane@example.com"
        assert data["salutation"] is None
        assert data["last_name"] is None
        assert data["place"] is None
        assert data["state"] is None
        assert data["zip_code"] is None

    def test_create_commenter_upsert_on_conflict(self, client, session: Session):
        """Test that creating a duplicate commenter performs upsert"""
        # First creation
        commenter_data = {
            "first_name": "Bob",
            "email": "bob@example.com",
            "place": "New York",
        }
        response1 = client.post("/api/comments/commenter", json=commenter_data)
        assert response1.status_code == 201

        # Second creation with same name/email but different data
        updated_data = {
            "first_name": "Bob",
            "email": "bob@example.com",
            "place": "Los Angeles",
            "last_name": "Smith",
        }
        response2 = client.post("/api/comments/commenter", json=updated_data)
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

    def test_create_commenter_invalid_email(self, client):
        """Test commenter creation with invalid email format"""
        commenter_data = {"first_name": "Invalid", "email": "not-an-email"}

        response = client.post("/api/comments/commenter", json=commenter_data)
        # Should fail due to database email validation constraint
        assert response.status_code in [400, 422, 500]  # Various possible error codes

    def test_create_commenter_empty_required_fields(self, client):
        """Test commenter creation with empty required fields"""
        test_cases = [
            {"first_name": "", "email": "test@example.com"},
            {"first_name": "Test", "email": ""},
            {"first_name": "   ", "email": "test@example.com"},  # whitespace only
        ]

        for commenter_data in test_cases:
            response = client.post("/api/comments/commenter", json=commenter_data)
            assert response.status_code in [400, 422, 500]

    def test_create_commenter_missing_required_fields(self, client):
        """Test commenter creation with missing required fields"""
        test_cases = [
            {"first_name": "Test"},  # missing email
            {"email": "test@example.com"},  # missing first_name
            {},  # missing both
        ]

        for commenter_data in test_cases:
            response = client.post("/api/comments/commenter", json=commenter_data)
            assert response.status_code == 422


class TestCommentEndpoint:
    """Tests for the /api/comments/comment endpoint"""

    def test_create_comment_success(self, client, session: Session):
        """Test successful comment creation"""
        comment_data = {
            "title": "Test Comment",
            "comment": "This is a test comment with some content.",
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

    def test_create_comment_on_document_success(
        self, client, document_id, session: Session
    ):
        """Test successful comment creation"""
        comment_data = {
            "title": "Test Comment",
            "comment": "This is a test comment with some content.",
            "document_id": document_id,
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

        stmt = select(DocumentComment).where(DocumentComment.document_id == document_id)
        db_document_comment = session.exec(stmt).one()
        assert db_document_comment.comment_id == db_comment.id
        assert db_document_comment.document_id == document_id, response.json()

    def test_create_comment_long_content(self, client, session: Session):
        """Test comment creation with long content"""
        long_content = "A" * 4500  # Close to the 5000 char limit
        comment_data = {"title": "Long Comment", "comment": long_content}

        response = client.post("/api/comments/comment", json=comment_data)

        assert response.status_code == 201
        data = response.json()
        assert data["comment"] == long_content

    def test_create_comment_too_long_content(self, client):
        """Test comment creation with content exceeding limit"""
        too_long_content = "A" * 5001  # Exceeds the 5000 char limit
        comment_data = {"title": "Too Long Comment", "comment": too_long_content}

        response = client.post("/api/comments/comment", json=comment_data)
        # Should fail due to database constraint
        assert response.status_code in [400, 422, 500]

    def test_create_comment_missing_required_fields(self, client):
        """Test comment creation with missing required fields"""
        test_cases = [
            {"title": "Test"},  # missing comment
            {"comment": "Test comment"},  # missing title
            {},  # missing both
        ]

        for comment_data in test_cases:
            response = client.post("/api/comments/comment", json=comment_data)
            assert response.status_code == 422

    def test_create_comment_empty_required_fields(self, client):
        """Test comment creation with empty required fields"""
        test_cases = [
            {"title": "", "comment": "Valid comment"},
            {"title": "Valid title", "comment": ""},
            {"title": "   ", "comment": "Valid comment"},  # whitespace only
        ]

        for comment_data in test_cases:
            response = client.post("/api/comments/comment", json=comment_data)
            assert response.status_code in [400, 422, 500]


class TestTagEndpoint:
    """Tests for the /api/comments/tag endpoint"""

    def test_create_tag_success(self, client, session: Session):
        """Test successful tag creation"""
        tag_data = {"tag": "Important Issue"}

        response = client.post("/api/comments/tag", json=tag_data)

        assert response.status_code == 201, response.json()
        data = response.json()

        # Should be slugified
        assert data["slug"] == "important-issue"

        # Verify it was saved to database
        stmt = select(Tag).where(Tag.slug == "important-issue")
        db_tag = session.exec(stmt).one()
        assert db_tag.slug == "important-issue"

    def test_create_tag_conflict_success(self, client, session: Session):
        """Test successful tag creation"""
        tag_data = {"tag": "Important Issue"}

        # First time inserted
        response = client.post("/api/comments/tag", json=tag_data)
        assert response.status_code == 201, response.json()
        data = response.json()
        assert data["slug"] == "important-issue"

        # Second time inserted
        response = client.post("/api/comments/tag", json=tag_data)
        assert response.status_code == 201, response.json()
        data = response.json()
        assert data["slug"] == "important-issue"

        # Verify it was saved to database only once
        stmt = select(Tag).where(Tag.slug == "important-issue")
        db_tag = session.exec(stmt).one()
        assert db_tag.slug == "important-issue"

    def test_create_tag_with_special_characters(self, client, session: Session):
        """Test tag creation with special characters that should be removed"""
        tag_data = {"tag": "Budget & Finance!!! @#$"}

        response = client.post("/api/comments/tag", json=tag_data)

        assert response.status_code == 201
        data = response.json()

        # Special characters should be removed, spaces converted to dashes
        assert data["slug"] == "budget-finance"

    def test_create_tag_with_multiple_spaces(self, client, session: Session):
        """Test tag creation with multiple consecutive spaces"""
        tag_data = {"tag": "Housing    and     Development"}

        response = client.post("/api/comments/tag", json=tag_data)

        assert response.status_code == 201
        data = response.json()

        # Multiple spaces should be converted to single dashes
        assert data["slug"] == "housing-and-development"

    def test_create_tag_duplicate_returns_existing(self, client, session: Session):
        """Test that creating a duplicate tag returns the existing one"""
        tag_data = {"tag": "Education"}

        # Create first tag
        response1 = client.post("/api/comments/tag", json=tag_data)
        assert response1.status_code == 201
        data1 = response1.json()
        assert data1["slug"] == "education"

        # Create duplicate tag (different case/format but same slug)
        duplicate_data = {"tag": "EDUCATION"}
        response2 = client.post("/api/comments/tag", json=duplicate_data)
        assert response2.status_code == 201
        data2 = response2.json()
        assert data2["slug"] == "education"

        # Should only be one tag in database
        stmt = select(Tag).where(Tag.slug == "education")
        tags = session.exec(stmt).all()
        assert len(tags) == 1

    def test_create_tag_mixed_case_and_spacing(self, client, session: Session):
        """Test tag creation with mixed case and spacing"""
        tag_data = {"tag": "  Public SAFETY & Security  "}

        response = client.post("/api/comments/tag", json=tag_data)

        assert response.status_code == 201
        data = response.json()

        # Should be lowercased, trimmed, and slugified
        assert data["slug"] == "public-safety-security"

    def test_create_tag_empty_string(self, client):
        """Test tag creation with empty string"""
        test_cases = [
            {"tag": ""},
            {"tag": "   "},  # whitespace only
            {"tag": "!@#$%"},  # only special characters
        ]

        for tag_data in test_cases:
            response = client.post("/api/comments/tag", json=tag_data)
            # Should fail because slugify returns null/empty for invalid input
            assert response.status_code in [400, 422, 500], response.json()

    def test_create_tag_missing_required_field(self, client):
        """Test tag creation with missing required field"""
        response = client.post("/api/comments/tag", json={})
        assert response.status_code == 422

    def test_create_tag_numbers_and_hyphens(self, client, session: Session):
        """Test tag creation with numbers and hyphens"""
        tag_data = {"tag": "COVID-19 Response 2024"}

        response = client.post("/api/comments/tag", json=tag_data)

        assert response.status_code == 201
        data = response.json()

        # Numbers and existing hyphens should be preserved
        assert data["slug"] == "covid-19-response-2024"


class TestIntegrationTests:
    """Integration tests for the comments system"""

    def test_create_full_comment_system_flow(self, client, session: Session):
        """Test creating commenter, comment, and tags in sequence"""
        # Create commenter
        commenter_data = {
            "first_name": "Alice",
            "email": "alice@example.com",
            "place": "Boston",
        }
        commenter_response = client.post("/api/comments/commenter", json=commenter_data)
        assert commenter_response.status_code == 201

        # Create comment
        comment_data = {
            "title": "Important Feedback",
            "comment": "This is important feedback about the system.",
        }
        comment_response = client.post("/api/comments/comment", json=comment_data)
        assert comment_response.status_code == 201

        # Create tags
        tag_data_1 = {"tag": "Feedback"}
        tag_data_2 = {"tag": "System Issues"}

        tag_response_1 = client.post("/api/comments/tag", json=tag_data_1)
        tag_response_2 = client.post("/api/comments/tag", json=tag_data_2)

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

    @patch("app.comments.moderation.score_text", return_value=0.2)
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

    @patch("app.comments.moderation.score_text", return_value=0.2)
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
        }

        response = client.post("/api/comments/submit", json=form_data)

        assert response.status_code == 201
        data = response.json()

        assert data["commenter"]["first_name"] == "Jane"
        assert data["comment"]["title"] == "Simple Comment"
        assert len(data["tags"]) == 1
        assert data["tags"][0]["slug"] == "general"

    @patch("app.comments.moderation.score_text", return_value=0.2)
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
        }

        response = client.post("/api/comments/submit", json=form_data)

        assert response.status_code == 201
        data = response.json()

        assert data["commenter"]["first_name"] == "Bob"
        assert data["comment"]["title"] == "No Tags Comment"
        assert len(data["tags"]) == 0

    @patch("app.comments.moderation.score_text", return_value=0.2)
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

    @patch("app.comments.moderation.score_text", return_value=0.2)
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
        }

        response = client.post("/api/comments/submit", json=form_data)

        assert response.status_code == 201
        data = response.json()

        # Should have created tags (duplicates handled by upsert)
        assert len(data["tags"]) == 3
        tag_slugs = [tag["slug"] for tag in data["tags"]]
        assert "environment" in tag_slugs
        assert "environment-climate" in tag_slugs

    def test_submit_full_comment_invalid_commenter_email(self, client):
        """Test submission with invalid commenter email"""
        form_data = {
            "commenter": {"first_name": "Invalid", "email": "not-an-email"},
            "comment": {"title": "Test Comment", "comment": "This should fail."},
            "tags": [{"tag": "Test"}],
        }

        response = client.post("/api/comments/submit", json=form_data)
        assert response.status_code == 422

    def test_submit_full_comment_missing_required_fields(self, client):
        """Test submission with missing required fields"""
        test_cases = [
            {
                # Missing commenter
                "comment": {"title": "Test", "comment": "Test"},
                "tags": [],
            },
            {
                # Missing comment
                "commenter": {"first_name": "Test", "email": "test@example.com"},
                "tags": [],
            },
            {
                # Missing comment title
                "commenter": {"first_name": "Test", "email": "test@example.com"},
                "comment": {"comment": "Test"},
                "tags": [],
            },
        ]

        for form_data in test_cases:
            response = client.post("/api/comments/submit", json=form_data)
            assert response.status_code == 422

    @patch("app.comments.moderation.score_text", return_value=0.2)
    def test_submit_full_comment_too_long_content(self, mock_score_text, client):
        """Test submission with comment content exceeding limit"""
        form_data = {
            "commenter": {"first_name": "Long", "email": "long@example.com"},
            "comment": {
                "title": "Too Long",
                "comment": "A" * 5001,  # Exceeds 5000 char limit
            },
            "tags": [{"tag": "Long"}],
        }

        response = client.post("/api/comments/submit", json=form_data)
        assert response.status_code == 422
