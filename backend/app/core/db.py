from sqlmodel import create_engine

from app.core.config import settings

echo = True

if settings.ENVIRONMENT == "production":
    echo = False

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI), echo=echo)
