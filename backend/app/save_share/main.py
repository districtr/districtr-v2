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
async def share_districtr_plan(
    document: Annotated[Document, Depends(get_document)],
    data: DocumentShareRequest,
    session: Session = Depends(get_session),
):
    print(f"Setting share for document {document.document_id} to {data.password}")
    print(f"Hashed password: {hash_password(data.password)}")
    existing_token = session.execute(
        text(
            """
            SELECT
                t.token_id,
                t.document_id,
                t.password_hash,
                d.public_id
            FROM document.map_document_token t
            LEFT JOIN document.document d ON t.document_id = d.document_id
            WHERE t.document_id = :doc_id
            """
        ),
        {"doc_id": document.document_id},
    ).fetchone()

    if existing_token:
        if data.password is not None and not existing_token.password_hash:
            hashed_password = hash_password(data.password)
            session.execute(
                text(
                    """
                    UPDATE document.map_document_token
                    SET password_hash = :password_hash
                    WHERE document_id = :document_id
                    """
                ),
                {
                    "password_hash": hashed_password,
                    "token_id": existing_token.token_id,
                    "document_id": document.document_id,
                },
            )
            session.commit()

        payload = {
            "token": existing_token.token_id,
            "access": data.access_type,
            "password_required": bool(existing_token.password_hash),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
        return {"token": token, "public_id": existing_token.public_id}

    else:
        hashed_password = hash_password(data.password) if data.password else None

        token_id = session.execute(
            text(
                """
                INSERT INTO document.map_document_token (token_id, document_id, password_hash)
                VALUES (gen_random_uuid(), :document_id, :password_hash)
                RETURNING token_id
                """
            ),
            {
                "document_id": document.document_id,
                "password_hash": hashed_password,
            },
        ).scalar_one()

        session.commit()

    payload = {
        "token": token_id,
        "access": data.access_type,
        "password_required": bool(hashed_password),
    }

    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    return {"token": token, "public_id": document.public_id}


@router.post("/api/document/{document_id}/edit_access", response_model=Document)
async def grant_edit_access_to_map_document(
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
    ).one()

    if not verify_password(data.password, result.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")

    return protected_document
