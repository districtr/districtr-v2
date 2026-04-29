"""SQLModel for the cached evaluation metrics table.

The shape of the JSONB ``metrics`` payload is owned by
``app.evaluation.registry``.  Every write stamps
``app.evaluation.registry.current_payload_version()`` into
``payload_version`` so cached rows can be invalidated on read once the
registry's payload shape advances.
"""

from sqlalchemy import BigInteger
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Column, Field, ForeignKey, MetaData

from app.constants import DOCUMENT_SCHEMA
from app.core.models import SQLModel, TimeStampMixin, UUIDType
from app.models import Document


class Evaluation(TimeStampMixin, SQLModel, table=True):
    metadata = MetaData(schema=DOCUMENT_SCHEMA)

    document_id: str = Field(
        sa_column=Column(
            UUIDType,
            ForeignKey(Document.document_id, ondelete="CASCADE"),
            primary_key=True,
        )
    )
    metrics: dict = Field(sa_column=Column(JSONB, nullable=False))
    # 63-bit hash of the metric registry; see app.evaluation.registry.
    payload_version: int = Field(sa_column=Column(BigInteger, nullable=False))
