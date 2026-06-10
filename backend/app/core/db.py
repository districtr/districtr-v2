from sqlalchemy import event
from sqlmodel import create_engine, Session

from app.core.config import settings

# Pool sizing is per worker process: total connections = workers (WEB_CONCURRENCY in
# fly.toml) x (pool_size + max_overflow), plus background tasks that open their own
# sessions. At 4 workers this allows up to 60 — keep Postgres max_connections comfortably
# above that. Requests beyond the pool wait up to pool_timeout (default 30s) in their
# threadpool thread, which acts as backpressure.
engine = create_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    echo=settings.ECHO_DB,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=5,
    max_overflow=10,
)


@event.listens_for(engine, "checkout")
def set_db_timeouts(dbapi_conn, _connection_record, _connection_proxy):
    # Prevent runaway queries from holding pool connections indefinitely.
    # lock_timeout: fail fast if waiting for a row lock (e.g. concurrent saves on same document).
    # statement_timeout: hard ceiling on any single statement.
    with dbapi_conn.cursor() as cursor:
        cursor.execute("SET lock_timeout = '15s'")
        cursor.execute("SET statement_timeout = '120s'")
        # idle_in_transaction_session_timeout: backstop against connection leaks. If a
        # connection is checked out with an open-but-idle transaction (e.g. a background
        # task that opened a transaction and never committed/closed it), Postgres aborts
        # it after this window so the connection returns to the pool instead of leaking.
        cursor.execute("SET idle_in_transaction_session_timeout = '60s'")


def get_session():
    with Session(engine) as session:
        try:
            yield session
        finally:
            session.close()
