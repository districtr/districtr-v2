from fastapi import Depends, HTTPException
from sqlmodel import select
from app.models import Document
from sqlalchemy.exc import NoResultFound
from sqlmodel import create_engine, Session
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

echo = True

if settings.ENVIRONMENT == "production":
    echo = False

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI), echo=echo)


def get_session():
    with Session(engine) as session:
        yield session


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
