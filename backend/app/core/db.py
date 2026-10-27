from sqlalchemy import event
from sqlmodel import create_engine, Session

from app.core.config import settings

engine = create_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    echo=settings.ECHO_DB,
    # 60 per worker process; the Dockerfile runs 2 uvicorn workers, so
    # 120/task, and RDS max_connections ~900 caps us at ~7 tasks. Keep in step
    # with the anyio threadpool limiter (app/main.py lifespan).
    pool_size=40,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args={
        # Server side: a backend whose client vanished without closing (host
        # died, network partition) keeps its locks, including the
        # session-level evaluation lock, until TCP gives up, ~2h at Linux
        # defaults. Probing after 60s idle bounds that to ~2 min.
        "options": "-c tcp_keepalives_idle=60 -c tcp_keepalives_interval=10 "
        "-c tcp_keepalives_count=6",
        # Client side: the same bound for a server that vanished mid-request.
        "keepalives": 1,
        "keepalives_idle": 60,
        "keepalives_interval": 10,
        "keepalives_count": 6,
    },
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
