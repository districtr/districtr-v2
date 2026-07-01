"""SQLModel for the cached evaluation metrics table.

The shape of the JSONB ``metrics`` payload is owned by ``app.evaluation.registry``.
Every write stamps ``app.evaluation.registry.current_payload_version()`` into
``payload_version`` so cached rows can be invalidated on read once the registry's
payload shape advances.
"""

from sqlalchemy import BigInteger, Integer, Text
from sqlalchemy.dialects.postgresql import JSON, JSONB
from sqlmodel import Column, Field, ForeignKey, MetaData

from app.constants import DOCUMENT_SCHEMA, EVALUATION_SCHEMA
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


class CountyDemographics(SQLModel, table=True):
    """Per-county demographic and election data aggregated from gerrydb VTD/block tables.

    Populated on demand when a gerrydb table's ideal is first requested. Since
    gerrydb tables are immutable once ingested, these rows are permanent.
    """

    __tablename__ = "county_demographics"
    metadata = MetaData(schema=EVALUATION_SCHEMA)

    # 5-char Census GEOID: STATEFP (2) + COUNTYFP (3)
    geoid: str = Field(sa_column=Column(Text, primary_key=True))
    # Gerrydb table that was aggregated to produce this row. Part of the
    # composite primary key so the same county GEOID can appear once per
    # source table (e.g. Navajo Nation spans multiple states/tables).
    gerrydb_table_name: str = Field(
        sa_column=Column(Text, primary_key=True, index=True)
    )
    # Separate column for total_pop to support split-information queries without
    # deserialising the full demographic_data JSON.
    total_pop: int | None = Field(sa_column=Column(Integer, nullable=True))
    demographic_data: dict | None = Field(sa_column=Column(JSON, nullable=True))
