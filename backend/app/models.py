from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from sqlmodel import Field, SQLModel, UUID, TIMESTAMP, text, Column


class UUIDType(UUID):
    def __init__(self, *args, **kwargs):
        kwargs["as_uuid"] = False
        super().__init__(*args, **kwargs)


class TimeStampMixin(SQLModel):
    created_at: Optional[datetime] = Field(
        sa_type=TIMESTAMP(timezone=True),
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
        },
        nullable=False,
        default=None,
    )

    updated_at: Optional[datetime] = Field(
        sa_type=TIMESTAMP(timezone=True),
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
        },
        nullable=False,
        default=None,
    )


class GerryDBTable(TimeStampMixin, SQLModel, table=True):
    uuid: str = Field(sa_column=Column(UUIDType, unique=True, primary_key=True))
    name: str = Field(nullable=False, unique=True)


class Document(TimeStampMixin, SQLModel, table=True):
    document_id: str | None = Field(
        sa_column=Column(UUIDType, unique=True, primary_key=True)
    )


class DocumentPublic(BaseModel):
    document_id: str
    created_at: datetime
    updated_at: datetime


class Assignments(SQLModel, table=True):
    # this is the empty parent table; not a partition itself
    document_id: str = Field(foreign_key="document.document_id", primary_key=True)
    geo_id: str = Field(primary_key=True)
    zone: int
    __table_args__ = {"postgresql_partition_by": "document_id"}
