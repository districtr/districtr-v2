from datetime import datetime
from typing import Optional
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


class GerryDBTableBase(TimeStampMixin, SQLModel):
    id: int = Field(default=None, primary_key=True)


class GerryDBTable(GerryDBTableBase, table=True):
    uuid: str = Field(sa_column=Column(UUIDType, unique=True))
    name: str = Field(nullable=False, unique=True)
