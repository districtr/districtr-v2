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


class Document(TimeStampMixin, SQLModel):
    document_id: str | None = Field(sa_column=Column(UUIDType, unique=True))


class AssignmentsMixin(SQLModel):
    # mixin used for defining parent table + each partition on the fly
    document_id: str = Field(foreign_key="document.document_id")
    geo_id: str
    zone: int


class Assignments(AssignmentsMixin, table=True):
    # this is the empty parent table; not a partition itself

    __table_args__ = {"postgres_partition_by": "document_id"}


#  In a better world, we'd create the partition on assignments via trigger
#  so that it happens even if a document is created outside the API.
#
# # one time, create the trigger that creates new assignments partitions
# create_partition_trigger = DDL(
#     """
#         CREATE TRIGGER create_assignment_partition AFTER INSERT ON document

#         BEGIN
#             CREATE TABLE assignments_{document_id} PARTITION OF assignments
#         VALUES IN (new.document_id)
#         END
#         """
# )
# # do it when the document table is created
# event.listen(Document.__table, "after_create", create_partition_trigger)
