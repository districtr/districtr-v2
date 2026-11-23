from fastapi import (
    Depends,
    APIRouter,
    HTTPException,
)
from typing import Annotated
from sqlalchemy import text
from sqlmodel import Session
import logging
from app.core.db import get_session
from app.core.dependencies import (
    get_document,
)
from app.models import (
    Document,
)
from app.core.config import settings
import jwt
from app.save_share.models import (
    DocumentShareRequest,
    DocumentShareResponse,
    GrantEditAccessRequest,
)
import bcrypt
from app.core.dependencies import parse_document_id, get_protected_document

logging.getLogger("sqlalchemy").setLevel(logging.ERROR)
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


router = APIRouter(tags=["save_share"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


@router.post("/api/document/{document_id}/share", response_model=DocumentShareResponse)
def share_districtr_plan(
    document: Annotated[Document, Depends(get_document)],
    data: DocumentShareRequest,
    session: Session = Depends(get_session),
):
    # Insert-if-missing in one statement: overlapping share requests for a
    # never-shared plan used to each insert a token row.
    session.execute(
        text(
            """
            INSERT INTO document.map_document_token (token_id, document_id)
            VALUES (gen_random_uuid(), :document_id)
            ON CONFLICT (document_id) DO NOTHING
            """
        ),
        {"document_id": document.document_id},
    )
    token_row = session.execute(
        text(
            """
            SELECT token_id, password_hash
            FROM document.map_document_token
            WHERE document_id = :document_id
            """
        ),
        {"document_id": document.document_id},
    ).one()
    old_hash = token_row.password_hash
    # Truthy, not `is not None`: the frontend sends "" when no password is set.
    # Old code stored a hash of "" on a second share click; treat that as
    # unset so the owner can still choose a real password.
    password_required = bool(old_hash) and not (
        data.password and verify_password("", old_hash)
    )
    if data.password and not password_required:
        # First real password wins: the compare-and-set loses to a concurrent
        # share that stored one first.
        session.execute(
            text(
                """
                UPDATE document.map_document_token
                SET password_hash = :password_hash
                WHERE document_id = :document_id
                  AND password_hash IS NOT DISTINCT FROM :old_hash
                """
            ),
            {
                "password_hash": hash_password(data.password),
                "document_id": document.document_id,
                "old_hash": old_hash,
            },
        )
        password_required = True
    session.commit()

    payload = {
        "token": token_row.token_id,
        "access": data.access_type,
        "password_required": password_required,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    return {"token": token, "public_id": document.public_id}


@router.post("/api/document/{document_id}/edit_access", response_model=Document)
def grant_edit_access_to_map_document(
    document_id: int,
    data: GrantEditAccessRequest,
    session: Session = Depends(get_session),
):
    parsed_DocumentID = parse_document_id(document_id)
    protected_document = get_protected_document(
        document_id=parsed_DocumentID,
        session=session,
    )
    result = session.execute(
        text(
            """
            SELECT password_hash
            FROM document.map_document_token
            WHERE document_id = :document_id
            """
        ),
        {"document_id": protected_document.document_id},
    ).one_or_none()

    # An empty password must not unlock a plan holding a hash of "" (stored by
    # old share code), and a plan with no password has nothing to unlock.
    if (
        not data.password
        or result is None
        or not result.password_hash
        or not verify_password(data.password, result.password_hash)
    ):
        raise HTTPException(status_code=401, detail="Invalid password")

    return protected_document
