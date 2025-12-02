from datetime import datetime
from pydantic import BaseModel
from sqlmodel import (
    Field,
    TIMESTAMP,
    Column,
    String,
    MetaData,
)
from enum import Enum
from app.constants import DOCUMENT_SCHEMA
from app.core.models import TimeStampMixin, UUIDType, SQLModel


class UnlockFromPublicId(BaseModel):
    password: str | None = None


class DocumentShareStatus(str, Enum):
    read = "read"
    edit = "edit"


class DocumentShareRequest(BaseModel):
    password: str | None = None
    access_type: DocumentShareStatus = DocumentShareStatus.read


class DocumentDraftStatus(str, Enum):
    in_progress = "in_progress"
    scratch = "scratch"
    ready_to_share = "ready_to_share"


class DocumentShareResponse(BaseModel):
    token: str
    public_id: int


class MapDocumentToken(TimeStampMixin, SQLModel, table=True):
    """
    Manages sharing of plans between users.

    Deliberately no user id for now, so that a user could theoretically re-access a plan from another machine.
    """

    metadata = MetaData(schema=DOCUMENT_SCHEMA)
    __tablename__ = "map_document_token"  # pyright: ignore
    token_id: str = Field(
        UUIDType,
        primary_key=True,
    )
    # TODO: This should be a foreign key
    document_id: str = Field(sa_column=Column(UUIDType))
    password_hash: str = Field(
        sa_column=Column(String, nullable=True)  # optional password
    )
    expiration_date: datetime = Field(
        sa_column=Column(TIMESTAMP(timezone=True), nullable=True)
    )
