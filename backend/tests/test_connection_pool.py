"""Regression tests for the DB connection-pool leak fix.

Background tasks run AFTER the request-scoped session has been closed, so they must
own their own session. Previously they reused the request session and the new
connection they checked out was never returned to the pool, eventually exhausting
it ("QueuePool limit of size 5 overflow 10 reached, connection timed out").

These tests assert that the self-owning code paths return their pooled connection
instead of leaking it -- including on the error path, which was part of the leak.
"""

import pytest

from app.core.db import engine
from app.comments.moderation import moderate_comment_by_id
from app.thumbnails.main import generate_thumbnail


@pytest.fixture(autouse=True)
def no_external_moderation(monkeypatch):
    # Keep moderation off the network: score the text locally without calling OpenAI.
    monkeypatch.setattr("app.comments.moderation.score_text", lambda _text: 0.0)


def test_self_owned_moderation_returns_connection():
    """moderate_comment_by_id opens its own ``with Session(engine)`` and commits.

    The comment id need not exist (the UPDATE simply affects 0 rows); the point is
    that the connection it checks out is returned to the pool afterward.
    """
    checked_out_before = engine.pool.checkedout()
    moderate_comment_by_id(2_000_000_000, "regression check")
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
