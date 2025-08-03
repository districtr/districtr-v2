from fastapi import (
    status,
    Depends,
    HTTPException,
    APIRouter,
)
from typing import Annotated
from sqlalchemy import text, bindparam
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, String
import logging
from app.core.db import get_session
from app.core.dependencies import (
    get_document,
    parse_document_id,
    get_protected_document,
)
from sqlalchemy.exc import MultipleResultsFound
from app.models import (
    Document,
)
from app.core.models import DocumentID
from app.save_share.locks import check_map_lock
from app.core.config import settings
import jwt
from app.core.models import UUIDType
from app.save_share.models import (
    DocumentCheckoutRequest,
    DocumentShareStatus,
    DocumentEditStatus,
    UserID,
    DocumentShareRequest,
    DocumentShareResponse,
)
import bcrypt


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


router = APIRouter(tags=["save_share"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


@router.post("/api/document/{document_id}/unlock")
async def unlock_document(
    document_id: str, data: UserID, session: Session = Depends(get_session)
):
    try:
        session.execute(
            text(
                """DELETE FROM document.map_document_user_session
                WHERE document_id = :document_id AND user_id = :user_id"""
            )
            .bindparams(
                bindparam(key="document_id", type_=UUIDType),
                bindparam(key="user_id", type_=String),
            )
            .params(document_id=document_id, user_id=data.user_id)
        )

        session.commit()
        print("Document unlocked")
        return {"status": DocumentEditStatus.unlocked}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/document/{document_id}/status")
async def get_document_status(
    document_id: str, data: UserID, session: Session = Depends(get_session)
):
    stmt = (
        text(
            "SELECT * from document.map_document_user_session WHERE document_id = :document_id"
        )
        .bindparams(bindparam(key="document_id", type_=UUIDType))
        .params(document_id=document_id)
    )
    result = session.execute(stmt).fetchone()
    if result:
        # if user id matches, return the document checked out, otherwise return locked
        if result.user_id == data.user_id:
            # there's already a record so no need to create
            return {"status": DocumentEditStatus.checked_out}

        # the map is already checked out; should return as locked
        return {"status": DocumentEditStatus.locked}
    else:
        # the map is able to be checked out;
        # should return as unlocked, but should now
        # create a record in the map_document_user_session table
        session.execute(
            text(
                f"""INSERT INTO document.map_document_user_session (document_id, user_id)
                VALUES ('{document_id}', '{data.user_id}')"""
            )
        )
        session.commit()

        return {"status": DocumentEditStatus.checked_out}


@router.post("/api/document/{document_id}/share", response_model=DocumentShareResponse)
async def share_districtr_plan(
    document: Annotated[Document, Depends(get_document)],
    data: DocumentShareRequest,
    session: Session = Depends(get_session),
):
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


@router.post("/api/document/{document_id}/checkout", status_code=status.HTTP_200_OK)
async def checkout_plan(
    document_id: DocumentID = Depends(parse_document_id),
    data: DocumentCheckoutRequest = {},
    session: Session = Depends(get_session),
):
    """
    check user-provided password against database. if matches, check if map is checked out
    - if pw matches and not checked out, check map out to user
    - if pw matches and checked out, return warning that map is still locked but switch access to edit
    """
    try:
        document = get_protected_document(document_id=document_id, session=session)
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document not found: {document_id}",
        )
    except MultipleResultsFound:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Multiple documents found for ID: {document_id}",
        )

    try:
        result = session.execute(
            text(
                """
                SELECT password_hash
                FROM document.map_document_token
                WHERE document_id = :document_id
                """
            ),
            {"document_id": document.document_id},
        ).one()
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found",
        )
    logger.info(
        f"Result: {data.password}, {hash_password(data.password)}, {result.password_hash}"
    )
    if data.password and verify_password(data.password, result.password_hash):
        assert document.document_id
        lock_status = check_map_lock(
            document_id=document.document_id, user_id=data.user_id, session=session
        )

        return {
            "status": lock_status,
            "access": DocumentShareStatus.edit,
            "document_id": document.document_id,
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password",
        )
