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
from app.core.dependencies import get_document as _get_document
from app.core.config import settings
import jwt
from uuid import uuid4
from app.models import (
    Document,
    DocumentPublic,
)
from app.save_share.locks import check_map_lock
from app.core.dependencies import get_document_public
from app.core.models import UUIDType
from app.save_share.models import (
    TokenRequest,
    DocumentShareStatus,
    DocumentEditStatus,
    UserID,
    DocumentShareRequest,
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


@router.post("/api/document/{document_id}/share")
async def share_districtr_plan(
    document: Annotated[Document, Depends(_get_document)],
    data: DocumentShareRequest,
    session: Session = Depends(get_session),
):
    # check if there's already a record for a document
    existing_token = session.execute(
        text(
            """
            SELECT token_id, password_hash FROM document.map_document_token
            WHERE document_id = :doc_id
            """
        ),
        {"doc_id": document.document_id},
    ).fetchone()

    if existing_token:
        token_uuid = existing_token.token_id

        if data.password is not None and not existing_token.password_hash:
            hashed_password = hash_password(data.password)
            session.execute(
                text(
                    """
                    UPDATE document.map_document_token
                    SET password_hash = :password_hash
                    WHERE token_id = :token_id
                    """
                ),
                {"password_hash": hashed_password, "token_id": token_uuid},
            )
            session.commit()

        payload = {
            "token": token_uuid,
            "access": data.access_type,
            "password_required": bool(existing_token.password_hash),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
        return {"token": token}

    else:
        token_uuid = str(uuid4())
        hashed_password = hash_password(data.password) if data.password else None

        session.execute(
            text(
                """
                INSERT INTO document.map_document_token (token_id, document_id, password_hash)
                VALUES (:token_id, :document_id, :password_hash)
                """
            ),
            {
                "token_id": token_uuid,
                "document_id": document.document_id,
                "password_hash": hashed_password,
            },
        )

        session.commit()

    payload = {
        "token": token_uuid,
        "access": data.access_type,
        "password_required": bool(hashed_password),
    }

    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    return {"token": token}


@router.post("/api/share/load_plan_from_share", response_model=DocumentPublic)
async def load_plan_from_share(
    data: TokenRequest,
    session: Session = Depends(get_session),
):
    token_id = data.token
    result = session.execute(
        text(
            """
            SELECT document_id, password_hash
            FROM document.map_document_token
            WHERE token_id = :token
            """
        ),
        {"token": token_id},
    ).fetchone()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found",
        )

    set_is_locked = False
    if result.password_hash:
        # password is required
        if data.password is None:
            set_is_locked = True
        if data.password and not verify_password(data.password, result.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid password",
            )

    document_id = (
        token_id if data.access == DocumentShareStatus.read else str(result.document_id)
    )

    return get_document_public(
        document_id=document_id,
        user_id=data.user_id,
        session=session,
        shared=True,
        lock_status=(
            DocumentEditStatus.locked if set_is_locked else DocumentEditStatus.unlocked
        ),
    )


@router.post("/api/document/{document_id}/checkout", status_code=status.HTTP_200_OK)
async def checkout_plan(
    document: Annotated[Document, Depends(_get_document)],
    data: TokenRequest,
    session: Session = Depends(get_session),
):
    """
    check user-provided password against database. if matches, check if map is checked out
    - if pw matches and not checked out, check map out to user
    - if pw matches and checked out, return warning that map is still locked but switch access to edit
    """

    try:
        result = session.execute(
            text(
                """
                SELECT document_id, password_hash
                FROM document.map_document_token
                WHERE token_id = :token
                """
            ),
            {"token": data.token},
        ).one()
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found",
        )

    if data.password and verify_password(data.password, result.password_hash):
        assert document.document_id
        lock_status = check_map_lock(
            document_id=document.document_id, user_id=data.user_id, session=session
        )

        return {"status": lock_status, "access": DocumentShareStatus.edit}
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password or none provided",
        )
