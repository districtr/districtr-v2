"""Regression tests for the DB connection-pool leak fix.

Background tasks run AFTER the request-scoped session has been closed, so they must
own their own session. Previously they reused the request session and the new
connection they checked out was never returned to the pool, eventually exhausting
it ("QueuePool limit of size 5 overflow 10 reached, connection timed out").

These tests assert that the self-owning code paths return their pooled connection
instead of leaking it -- including on the error path, which was part of the leak.
"""

import pytest
from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine
from app.submissions import moderation
from app.thumbnails.main import generate_thumbnail


@pytest.mark.parametrize("fail", [False, True], ids=["commit", "error"])
def test_self_owned_moderation_returns_connection(monkeypatch, fail):
    """moderate_submission_in_background opens its own ``with Session(engine)``.

    The inner call is stubbed to query-and-commit (or raise mid-transaction)
    so both paths run without seeding a submission in the non-test database;
    either way the checked-out connection must go back to the pool.
    """

    def query_then_maybe_fail(submission_id, session):
        session.execute(text("SELECT 1"))  # checks out a pooled connection
        if fail:
            raise RuntimeError("mid-transaction failure")
        session.commit()

    monkeypatch.setattr(moderation, "moderate_submission", query_then_maybe_fail)
    checked_out_before = engine.pool.checkedout()
    if fail:
        with pytest.raises(RuntimeError):
            moderation.moderate_submission_in_background(2_000_000_000)
    else:
        moderation.moderate_submission_in_background(2_000_000_000)
    assert engine.pool.checkedout() == checked_out_before


def test_self_owned_thumbnail_returns_connection_on_error():
    """generate_thumbnail with no session self-owns one; the error path must release it.

    With a non-existent document the inner query raises, but the ``with`` block must
    still return the connection to the pool -- the failure mode that leaked before.
    """
    checked_out_before = engine.pool.checkedout()
    with pytest.raises(Exception):
        generate_thumbnail(document_id="does-not-exist", out_directory=None)
    assert engine.pool.checkedout() == checked_out_before


def test_on_commit_drop_temp_table_is_removed_after_commit():
    """ON COMMIT DROP temp tables are gone once the transaction commits.

    The assignment-insert paths create a temp table per request; without
    ON COMMIT DROP a committed temp table lives for the life of the pooled
    connection and the create/drop churn bloats the system catalogs. This guards
    the mechanism the fix relies on.
    """
    table = "t_oncommitdrop_regression"
    with Session(engine) as session:
        session.connection().execute(
            text(f"CREATE TEMP TABLE {table} (a int) ON COMMIT DROP")
        )
        session.commit()  # real top-level commit -> ON COMMIT DROP fires here
        remaining = (
            session.connection()
            .execute(
                text(
                    "SELECT count(*) FROM pg_class c "
                    "JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE n.nspname LIKE 'pg_temp%' AND c.relname = :name"
                ),
                {"name": table},
            )
            .scalar()
        )
    assert remaining == 0
