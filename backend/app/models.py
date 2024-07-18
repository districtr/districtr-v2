from datetime import datetime
from typing import Any, Optional
from sqlmodel import Field, SQLModel, UUID, TIMESTAMP, text, Column
from geoalchemy2 import Geometry


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


class Population(SQLModel, table=True):
    path: str = Field(unique=True, nullable=False, index=True, primary_key=True)
    area_land: int
    area_water: int
    other_pop: int
    total_pop: int
    geography: Any = Field(
        sa_column=Column(Geometry(geometry_type="POLYGON", srid=4269))
    )
