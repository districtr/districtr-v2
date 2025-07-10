from sqlmodel import create_engine, Session

from app.core.config import settings

engine = create_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    echo=settings.ECHO_DB,
    pool_pre_ping=True,
    pool_recycle=3600,
)


def get_session():
    with Session(engine) as session:
        try:
            yield session
        finally:
            session.close()
