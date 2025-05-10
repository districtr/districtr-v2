from fastapi import Depends, HTTPException
from sqlmodel import select, Session
from app.models import Document
from sqlalchemy.exc import NoResultFound
from app.core.db import get_session
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def get_document(document_id: str, session: Session = Depends(get_session)) -> Document:
    try:
        document = session.exec(
            select(Document).where(Document.document_id == document_id)
        ).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Document not found")
    except Exception as e:
        logger.error(f"Error loading document: {str(e)}")
        raise HTTPException(status_code=500, detail="Error loading document")

    return document
