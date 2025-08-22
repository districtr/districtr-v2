from pydantic import BaseModel, validator
from datetime import datetime
from sqlmodel import (
    Field,
    ForeignKey,
    UniqueConstraint,
    Column,
    MetaData,
    String,
    Index,
    CheckConstraint,
    Integer,
    Float,
)
from sqlalchemy import func
from app.constants import COMMENTS_SCHEMA
from app.core.models import TimeStampMixin, SQLModel
from app.models import Document
from enum import Enum
from sqlalchemy import Enum as SAEnum


class ReviewStatus(str, Enum):
    REVIEWED = "REVIEWED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class Commenter(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)
    __table_args__ = (
        UniqueConstraint(
            "first_name",
            "email",
            name="commenter_unique_on_first_name_and_email",
        ),
        Index(
            "idx_commenter_first_name_and_email",
            func.lower(func.trim(Column("first_name"))),
            func.lower(
                func.trim(Column("email"))
            ),  # We're already lowering and trimming in the email validation trigger but this is a backup
        ),
        CheckConstraint(
            "email ~* '^[a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'",
            name="valid_email_format",
        ),
        CheckConstraint("LENGTH(TRIM(email)) > 0", name="email_not_empty"),
        CheckConstraint("LENGTH(TRIM(first_name)) > 0", name="first_name_not_empty"),
    )

    id: int = Field(
        sa_column=Column(
            Integer,
            nullable=False,
            unique=True,
            autoincrement=True,
            index=True,
            primary_key=True,
        )
    )

    # Required fields
    first_name: str = Field(sa_column=Column(String(255), nullable=False))
    email: str = Field(sa_column=Column(String(320), nullable=False))  # RFC 5321 limit

    # Optional fields
    salutation: str = Field(sa_column=Column(String(255), nullable=True))
    last_name: str = Field(sa_column=Column(String(255), nullable=True))
    place: str = Field(sa_column=Column(String(255), nullable=True))
    state: str = Field(sa_column=Column(String(255), nullable=True))
    zip_code: str = Field(sa_column=Column(String(255), nullable=True))
    moderation_score: float = Field(
        sa_column=Column(Float, nullable=True, default=None)
    )
    review_status: ReviewStatus | None = Field(
        default=None,
        sa_column=Column(
            SAEnum(
                ReviewStatus,
                name="review_status_enum",
                schema=COMMENTS_SCHEMA,
                native_enum=True,
                validate_strings=True,
            ),
            nullable=True,
        ),
    )

    def __str__(self) -> str:
        fields_to_moderate = self.model_dump(
            include={"salutation", "first_name", "last_name", "place", "state"},
            exclude_unset=True,
            exclude_none=True,
        )
        return " ".join(fields_to_moderate.values())


class CommenterCreate(BaseModel):
    first_name: str
    email: str
    salutation: str | None = None
    last_name: str | None = None
    place: str | None = None
    state: str | None = None
    zip_code: str | None = None


class CommenterCreateWithRecaptcha(BaseModel):
    commenter: CommenterCreate
    recaptcha_token: str


class CommenterPublic(CommenterCreate):
    created_at: datetime | None
    updated_at: datetime | None


class Comment(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)
    __table_args__ = (
        CheckConstraint("LENGTH(TRIM(title)) > 0", name="title_not_empty"),
        CheckConstraint("LENGTH(TRIM(comment)) > 0", name="comment_not_empty"),
    )

    id: int = Field(
        sa_column=Column(
            Integer,
            nullable=False,
            unique=True,
            autoincrement=True,
            index=True,
            primary_key=True,
        )
    )
    title: str = Field(sa_column=Column(String(255), nullable=False))
    # TODO: Check with Moon what the right max length is
    comment: str = Field(sa_column=Column(String(5000), nullable=False))
    commenter_id: int = Field(
        sa_column=Column(ForeignKey(Commenter.id), nullable=True, index=True)
    )
    moderation_score: float = Field(
        sa_column=Column(Float, nullable=True, default=None)
    )
    review_status: ReviewStatus | None = Field(
        default=None,
        sa_column=Column(
            SAEnum(
                ReviewStatus,
                name="review_status_enum",  # <-- match existing PG type name
                schema=COMMENTS_SCHEMA,  # <-- match schema
                native_enum=True,
                validate_strings=True,
            ),
            nullable=True,
        ),
    )


class CommentCreate(BaseModel):
    title: str
    comment: str
    commenter_id: int | None = None
    document_id: str | None = None


class CommentCreateWithRecaptcha(BaseModel):
    comment: CommentCreate
    recaptcha_token: str


class CommentPublic(CommentCreate):
    created_at: datetime | None
    updated_at: datetime | None


class Tag(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)
    __table_args__ = (CheckConstraint("LENGTH(slug) > 0", name="slug_not_empty"),)

    id: int = Field(
        sa_column=Column(
            Integer,
            nullable=False,
            unique=True,
            autoincrement=True,
            index=True,
            primary_key=True,
        )
    )
    slug: str = Field(
        sa_column=Column(String(255), nullable=False, unique=True, index=True)
    )
    moderation_score: float = Field(
        sa_column=Column(Float, nullable=True, default=None)
    )
    review_status: ReviewStatus | None = Field(
        default=None,
        sa_column=Column(
            SAEnum(
                ReviewStatus,
                name="review_status_enum",  # <-- match existing PG type name
                schema=COMMENTS_SCHEMA,  # <-- match schema
                native_enum=True,
                validate_strings=True,
            ),
            nullable=True,
        ),
    )


class TagCreate(BaseModel):
    tag: str

    @validator("tag")
    def validate_tag(cls, value):
        if not value or value.strip() == "":
            raise ValueError("Tag cannot be empty")
        return value


class TagCreateWithRecaptcha(BaseModel):
    tag: TagCreate
    recaptcha_token: str


class TagPublic(BaseModel):
    slug: str


class CommentTag(SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)
    __table_args__ = (
        UniqueConstraint("comment_id", "tag_id", name="unique_comment_tag_link"),
    )
    __tablename__ = "comment_tag"  # type: ignore

    comment_id: int = Field(
        sa_column=Column(ForeignKey(Comment.id), primary_key=True, nullable=False)
    )
    tag_id: int = Field(
        sa_column=Column(ForeignKey(Tag.id), primary_key=True, nullable=False)
    )


class DocumentComment(SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)
    __tablename__ = "document_comment"  # type: ignore

    # Unique is True because a single comment should not apply to multiple documents.
    # This does not prevent the document from having many comments.
    comment_id: int = Field(
        sa_column=Column(
            ForeignKey(Comment.id),  # type: ignore
            primary_key=True,
            nullable=False,
            unique=True,
        )
    )
    document_id: str = Field(
        sa_column=Column(
            ForeignKey(Document.document_id), primary_key=False, nullable=False
        )
    )


class FullCommentFormCreate(BaseModel):
    comment: CommentCreate
    commenter: CommenterCreate
    tags: list[TagCreate]
    recaptcha_token: str


class FullCommentForm(BaseModel):
    comment: Comment
    commenter: Commenter
    tags: list[Tag]


class FullCommentFormResponse(BaseModel):
    comment: CommentPublic
    commenter: CommenterPublic
    tags: list[TagPublic]


class ModerationScore(BaseModel):
    ok: bool
    score: float
    error: str | None = None


class PublicCommentResponse(BaseModel):
    title: str
    comment: str
    first_name: str
    last_name: str | None = None
    place: str | None = None
    state: str | None = None
    zip_code: str | None = None
    tags: list[str | None] = []


class ReviewStatusUpdate(BaseModel):
    review_status: ReviewStatus


class CommentReview(BaseModel):
    id: int
    title: str
    comment: str
    commenter_id: int | None = None
    moderation_score: float | None = None
    review_status: ReviewStatus | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TagReview(BaseModel):
    id: int
    slug: str
    moderation_score: float | None = None
    review_status: ReviewStatus | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CommenterReview(BaseModel):
    id: int
    first_name: str
    email: str
    salutation: str | None = None
    last_name: str | None = None
    place: str | None = None
    state: str | None = None
    zip_code: str | None = None
    moderation_score: float | None = None
    review_status: ReviewStatus | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReviewUpdateResponse(BaseModel):
    message: str
    id: int
    new_status: ReviewStatus
