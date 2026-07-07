"""Regression test for the concurrent cache-cold evaluation race.

Two requests that both see a cold cache must not both run compute_metrics:
the per-document advisory lock in update_or_select_document_evaluation
serializes them, and the loser returns the winner's committed row. Pre-fix,
the loser 500'd with a UniqueViolation on evaluation_pkey.

Uses real commits on independent connections (advisory locks are
connection-scoped), so it manages its own rows instead of the
rollback_session fixtures.
"""

import threading
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlmodel import Session, select

from app.evaluation.main import update_or_select_document_evaluation
from app.evaluation.models import Evaluation
from app.evaluation.registry import CURRENT_PAYLOAD_VERSION
from app.evaluation.types import MetricsEnvelope
from app.models import Document
from app.utils import create_districtr_map

SLUG = "eval_lock_test_geos"


@pytest.fixture(name="committed_document_id")
def committed_document_fixture(engine):
    with Session(engine) as session:
        # create_districtr_map probes the layer table; a stub is enough since
        # compute_metrics is patched out in the test.
        session.execute(
            text(f"CREATE TABLE IF NOT EXISTS gerrydb.{SLUG} (path TEXT)")
        )
        # one block-format geoid so infer_geo_unit_type recognizes the layer
        session.execute(
            text(f"INSERT INTO gerrydb.{SLUG} (path) VALUES ('200519661001001')")
        )
        session.execute(
            text(
                "INSERT INTO gerrydbtable (uuid, name, updated_at) "
                "VALUES (gen_random_uuid(), :name, now()) "
                "ON CONFLICT (name) DO UPDATE SET updated_at = now()"
            ),
            {"name": SLUG},
        )
        create_districtr_map(
            session=session,
            name="Eval lock test map",
            districtr_map_slug=SLUG,
            gerrydb_table_name=SLUG,
            parent_layer=SLUG,
        )
        document = Document(document_id=str(uuid4()), districtr_map_slug=SLUG)
        session.add(document)
        session.commit()
        document_id = document.document_id
    yield document_id
    with Session(engine) as session:
        # evaluation row cascades with the document
        session.execute(
            text("DELETE FROM document.document WHERE document_id = :d"),
            {"d": document_id},
        )
        session.execute(
            text("DELETE FROM districtrmap WHERE districtr_map_slug = :s"),
            {"s": SLUG},
        )
        session.execute(text("DELETE FROM gerrydbtable WHERE name = :s"), {"s": SLUG})
        session.execute(text(f"DROP TABLE IF EXISTS gerrydb.{SLUG}"))
        session.commit()


def test_concurrent_cold_evaluations_compute_once(
    engine, committed_document_id, monkeypatch
):
    compute_entered = threading.Event()
    release_compute = threading.Event()
    compute_calls = []

    def fake_compute(background_tasks, session, document_id):
        compute_calls.append(document_id)
        compute_entered.set()
        assert release_compute.wait(timeout=10), "test never released the compute"
        return MetricsEnvelope(
            payload_version=CURRENT_PAYLOAD_VERSION,
            metrics={"fake": {"value": 1}},
            failed=[],
        )

    monkeypatch.setattr("app.evaluation.main.compute_metrics", fake_compute)

    envelopes = []
    errors = []

    def request():
        try:
            with Session(engine) as session:
                document = session.exec(
                    select(Document).where(
                        Document.document_id == committed_document_id
                    )
                ).one()
                envelopes.append(
                    update_or_select_document_evaluation(None, session, document)
                )
        except Exception as exc:  # pragma: no cover - failure detail for assert
            errors.append(exc)

    winner = threading.Thread(target=request)
    winner.start()
    assert compute_entered.wait(timeout=10), "winner never reached compute"

    # Winner holds the advisory lock, parked in compute, nothing committed:
    # the loser sees a cold cache and must block on the lock.
    loser = threading.Thread(target=request)
    loser.start()
    loser.join(timeout=1)
    assert loser.is_alive(), "loser should be blocked on the advisory lock"

    release_compute.set()
    winner.join(timeout=30)
    loser.join(timeout=30)
    assert not winner.is_alive() and not loser.is_alive()

    assert errors == []
    assert len(compute_calls) == 1, "loser recomputed instead of reading the cache"
    assert len(envelopes) == 2
    assert all(e["metrics"] == {"fake": {"value": 1}} for e in envelopes)

    with Session(engine) as session:
        rows = session.exec(
            select(Evaluation).where(
                Evaluation.document_id == committed_document_id
            )
        ).all()
        assert len(rows) == 1
