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
