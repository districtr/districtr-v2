from datetime import datetime
from pydantic import BaseModel, computed_field, model_validator
from uuid import UUID
from sqlmodel import (
    Field,
    SQLModel,
    TIMESTAMP,
    UUID as UUIDField,
    text,
)


class UUIDType(UUIDField):
    def __init__(self, *args, **kwargs):
        kwargs["as_uuid"] = False
        super().__init__(*args, **kwargs)


class TimeStampMixin(SQLModel):
    created_at: datetime | None = Field(
        sa_type=TIMESTAMP(timezone=True),
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
        },
        nullable=False,
        default=None,
    )

    updated_at: datetime | None = Field(
        sa_type=TIMESTAMP(timezone=True),
        sa_column_kwargs={
            "server_default": text("CURRENT_TIMESTAMP"),
        },
        nullable=False,
        default=None,
    )


class DocumentID(BaseModel):
    """
    Represents a document identifier.

    Attributes:
        document_id (str): The unique identifier of the document.
        is_public (bool): Indicates whether the document is public.
        value (int | str): The value of the document identifier.

    Raises:
        ValueError: If the private document_id is not a valid UUID.
    """

    document_id: str | int

    @computed_field
    @property
    def is_public(self) -> bool:
        return isinstance(self.document_id, int) or (
            isinstance(self.document_id, str) and self.document_id.isdigit()
        )

    @computed_field
    @property
    def value(self) -> int | str:
        if self.is_public:
            return int(self.document_id)
        return self.document_id

    @model_validator(mode="after")
    def validate_private_uuid(self) -> "DocumentID":
        if not self.is_public:
            try:
                UUID(self.document_id)
            except ValueError:
                raise ValueError(
                    f"Private document_id must be a valid UUID, got: {self.document_id}"
                )
        return self
