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
)
from sqlalchemy import func
from app.constants import COMMENTS_SCHEMA
from app.core.models import TimeStampMixin, SQLModel


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


class Comment(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)

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
    comment: str = Field(sa_column=Column(String(5000), nullable=False))

    commenter_id: int = Field(
        sa_column=Column(ForeignKey(Commenter.id), nullable=True, index=True)
    )


class Tag(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=COMMENTS_SCHEMA)

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
