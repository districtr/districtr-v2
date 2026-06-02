from sqlalchemy import event
from sqlmodel import create_engine, Session

from app.core.config import settings

engine = create_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    echo=settings.ECHO_DB,
    pool_pre_ping=True,
    pool_recycle=3600,
)


@event.listens_for(engine, "connect")
def set_db_timeouts(dbapi_conn, _):
    # Prevent runaway queries from holding pool connections indefinitely.
    # lock_timeout: fail fast if waiting for a row lock (e.g. concurrent saves on same document).
    # statement_timeout: hard ceiling on any single statement.
    cursor = dbapi_conn.cursor()
    cursor.execute("SET lock_timeout = '15s'")
    cursor.execute("SET statement_timeout = '120s'")
    # idle_in_transaction_session_timeout: backstop against connection leaks. If a
    # connection is checked out with an open-but-idle transaction (e.g. a background
    # task that opened a transaction and never committed/closed it), Postgres aborts
    # it after this window so the connection returns to the pool instead of leaking.
    cursor.execute("SET idle_in_transaction_session_timeout = '60s'")
    cursor.close()


def get_session():
    with Session(engine) as session:
        try:
            yield session
        finally:
            session.close()
