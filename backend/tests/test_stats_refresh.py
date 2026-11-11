import logging
from contextlib import nullcontext
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text, update
from sqlalchemy.pool import NullPool

from app import stats_refresh
from app.core.config import settings
from app.core.db import set_db_timeouts
from app.main import app
from app.models import Assignments, Document
from tests.constants import GERRY_DB_FIXTURE_NAME

GEO_ID = "202090441022004"
UUID = "6f1c2c3e-1111-4222-8333-444455556666"


def set_plan(session, document_id, *, assigned=True, **ago):
    """Stamp the plan's timestamps as offsets before the DB's now(), which
    stale_idle_plans compares against (frozen for the test's transaction)."""
    if assigned:
        session.add(Assignments(document_id=document_id, geo_id=GEO_ID, zone=1))
    now = session.execute(text("SELECT now()")).scalar_one()
    ago = {
        "assignments_updated_at": timedelta(hours=2),
        "updated_at": timedelta(hours=2),
        "stats_published_at": None,
        **ago,
    }
    values = {k: now - v if isinstance(v, timedelta) else v for k, v in ago.items()}
    session.execute(
        update(Document).where(Document.document_id == document_id).values(**values)
    )
    session.commit()


H, D = timedelta(hours=1), timedelta(days=1)


@pytest.mark.parametrize(
    "case, ago, assigned, picked",
    [
        ("idle and stale", {}, True, True),
        ("saved 10 min ago", {"updated_at": H / 6}, True, False),
        ("zones changed 10 min ago", {"assignments_updated_at": H / 6}, True, False),
        (
            "idle 50 min",
            {"assignments_updated_at": H * 5 / 6, "updated_at": H * 5 / 6},
            True,
            False,
        ),
        (
            "idle 70 min",
            {"assignments_updated_at": H * 7 / 6, "updated_at": H * 7 / 6},
            True,
            True,
        ),
        (
            "zones changed 1.5 days ago",
            {"assignments_updated_at": D * 1.5, "updated_at": D * 1.5},
            True,
            True,
        ),
        # Saved 07:30 two days before: first qualified the next night, which was missed.
        (
            "missed a night after saving just before 08:00",
            {"assignments_updated_at": 2 * D + H / 2, "updated_at": 2 * D + H / 2},
            True,
            True,
        ),
        (
            "older than lookback",
            {"assignments_updated_at": 3 * D, "updated_at": 3 * D},
            True,
            False,
        ),
        (
            "zones changed 3 days ago, renamed 2 h ago",
            {"assignments_updated_at": 3 * D},
            True,
            False,
        ),
        # publish stamps the assignments_updated_at it built from
        ("already published", {"stats_published_at": 2 * H}, True, False),
        (
            "published, then renamed",
            {"assignments_updated_at": 3 * H, "stats_published_at": 3 * H},
            True,
            False,
        ),
        ("community map", {"map_type": "community"}, True, False),
        ("untouched blank", {}, False, False),
        ("published plan since cleared", {"stats_published_at": 3 * H}, False, True),
    ],
)
def test_picks_only_stale_plans_idle_for_an_hour(
    client, session, document_id, case, ago, assigned, picked
):
    # Another plan with assignments, so "untouched blank" pins the EXISTS to this plan.
    other = client.post(
        "/api/create_document", json={"districtr_map_slug": GERRY_DB_FIXTURE_NAME}
    ).json()["document_id"]
    session.add(Assignments(document_id=other, geo_id=GEO_ID, zone=1))
    set_plan(session, document_id, assigned=assigned, **ago)
    ids = [str(d) for d, _ in stats_refresh.stale_idle_plans(session)]
    assert (str(document_id) in ids) == picked, case


def test_rechecks_one_plan(session, document_id):
    set_plan(session, document_id)
    assert stats_refresh.stale_idle_plans(session, document_id)
    set_plan(session, document_id, assigned=False, updated_at=timedelta(0))
    assert stats_refresh.stale_idle_plans(session, document_id) == []


@pytest.fixture
def app_engine(engine):
    """The test DB behind the production engine's checkout hook (app/core/db.py)."""
    app_engine = create_engine(engine.url)
    event.listen(app_engine, "checkout", set_db_timeouts)
    yield app_engine
    app_engine.dispose()


@pytest.fixture
def run(app_engine, monkeypatch):
    """refresh_stale_plans over three fake plans on a fake clock, with a real
    advisory lock. Publishing plan 2 fails."""
    state = SimpleNamespace(
        now=0.0,
        plans=[("a", 1), ("b", 2), ("c", 3)],
        failing={2},
        fresh=set(),  # public_ids publish finds already fresh
        editing=set(),  # document_ids whose owner came back after 08:00
        publish_seconds=0.0,
        on_publish=lambda document_id: None,
        starts=[],  # (public_id, clock) for each publish
    )

    def sleep(seconds):
        assert seconds >= 0
        state.now += seconds

    def stale_idle_plans(session, document_id=None):
        return [
            p
            for p in state.plans
            if document_id in (None, p[0]) and p[0] not in state.editing
        ]

    def publish(document_id, public_id):
        state.starts.append((public_id, state.now))
        state.on_publish(document_id)
        state.now += state.publish_seconds
        if public_id in state.failing:
            raise RuntimeError(f"S3 down for {document_id}")
        return public_id not in state.fresh

    monkeypatch.setattr(stats_refresh, "engine", app_engine)
    monkeypatch.setattr(stats_refresh, "monotonic", lambda: state.now)
    monkeypatch.setattr(stats_refresh, "sleep", sleep)
    monkeypatch.setattr(stats_refresh, "stale_idle_plans", stale_idle_plans)
    monkeypatch.setattr(stats_refresh, "publish_district_stats_to_s3", publish)
    return state


@pytest.mark.parametrize("publish_seconds", [0, 1800])
def test_rebuilds_start_on_a_fixed_schedule_and_survive_a_failure(run, publish_seconds):
    run.publish_seconds = publish_seconds
    assert stats_refresh.refresh_stale_plans() == 2
    # Slots count from the run's start, so slow rebuilds don't push it later.
    assert run.starts == [(1, 0), (2, 3600), (3, 7200)]


def test_stops_at_the_time_limit_and_says_so(run, caplog):
    run.fresh = {1}
    run.publish_seconds = 2.5 * 3600
    assert stats_refresh.refresh_stale_plans() == 0
    assert [p for p, _ in run.starts] == [1, 2]  # plan 3 waits for tomorrow
    summary = caplog.records[-1]
    assert summary.levelno == logging.ERROR
    assert "published 0, skipped 1, failed 1, left for tomorrow 1" in summary.message


def test_quiet_night(run, caplog):
    run.plans = []
    with caplog.at_level(logging.INFO, logger="app.stats_refresh"):
        assert stats_refresh.refresh_stale_plans() == 0
    assert caplog.records[-1].levelno == logging.INFO


def test_skips_a_plan_whose_owner_came_back(run):
    run.on_publish = lambda document_id: run.editing.add("b")
    assert stats_refresh.refresh_stale_plans() == 2
    assert [p for p, _ in run.starts] == [1, 3]


def try_lock(engine):
    """Whether another process could take the nightly lock right now."""
    other = create_engine(engine.url, poolclass=NullPool)
    with other.connect() as conn:  # closing the backend drops a lock it took
        got = conn.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": stats_refresh.LOCK_KEY}
        ).scalar_one()
    other.dispose()
    return got


def test_holds_the_lock_for_the_whole_run_then_releases_it(run, app_engine):
    held = []
    run.on_publish = lambda document_id: held.append(not try_lock(app_engine))
    stats_refresh.refresh_stale_plans()
    assert held == [True, True, True]
    assert try_lock(app_engine)
    assert try_lock(app_engine)  # and stays free for the next night


def test_only_one_process_runs_at_a_time(run, app_engine):
    other = create_engine(app_engine.url, poolclass=NullPool)
    with other.connect() as conn:  # closing releases the lock even if we fail
        conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": stats_refresh.LOCK_KEY})
        assert stats_refresh.refresh_stale_plans() == 0
    other.dispose()
    assert run.starts == []
    assert stats_refresh.refresh_stale_plans() == 2


def test_failure_log_names_the_plan_not_its_uuid(run, caplog):
    run.plans = [(UUID, 42)]
    run.failing = {42}
    stats_refresh.refresh_stale_plans()
    assert "plan 42: RuntimeError" in caplog.text
    assert UUID not in caplog.text


def test_wakes_daily_at_start_hour_and_survives_a_crash(monkeypatch, caplog):
    clock = SimpleNamespace(now=20_000 * 86400 + 9 * 3600.0)  # 09:00 UTC
    sleeps, runs = [], []

    def sleep(seconds):
        sleeps.append(seconds)
        clock.now += seconds

    def refresh():
        runs.append(clock.now % 86400)
        clock.now += 60
        if len(runs) == 1:
            raise RuntimeError(f"crashed on {UUID}")
        raise SystemExit  # stop the loop

    monkeypatch.setattr(stats_refresh, "time", lambda: clock.now)
    monkeypatch.setattr(stats_refresh, "sleep", sleep)
    monkeypatch.setattr(stats_refresh, "refresh_stale_plans", refresh)
    with pytest.raises(SystemExit):
        stats_refresh._run_nightly()
    assert sleeps == [23 * 3600, 86400 - 60]
    assert runs == [8 * 3600, 8 * 3600]
    assert "crashed: RuntimeError" in caplog.text
    assert UUID not in caplog.text


@pytest.mark.parametrize("bucket, starts", [(None, False), ("plans", True)])
def test_starts_only_when_s3_is_configured(monkeypatch, bucket, starts):
    threading = Mock()
    monkeypatch.setattr(stats_refresh, "threading", threading)
    monkeypatch.setattr(type(settings), "get_s3_client", lambda self: Mock())
    monkeypatch.setattr(settings, "AWS_S3_BUCKET", bucket)
    stats_refresh.start_nightly_stats_refresh()
    assert threading.Thread.called == starts


def test_lifespan_starts_the_nightly_refresh(monkeypatch):
    start = Mock()
    monkeypatch.setattr("app.main.start_nightly_stats_refresh", start)
    with TestClient(app):
        pass
    start.assert_called_once()


@pytest.fixture
def unions(client, session, document_id, monkeypatch):
    """Two plans, a and b, and helpers to seed and count their district_unions
    rows. The test session rolls back, so nothing it writes is visible to
    another connection: the eviction runs on it."""
    monkeypatch.setattr(stats_refresh, "Session", lambda _engine: nullcontext(session))
    b = client.post(
        "/api/create_document", json={"districtr_map_slug": GERRY_DB_FIXTURE_NAME}
    ).json()["document_id"]

    def rows(plan, *days_old, edited=15):
        """Replace the plan's rows with one per age, its last edit `edited` days ago."""
        session.execute(
            text("DELETE FROM document.district_unions WHERE document_id = :d"),
            {"d": plan},
        )
        for zone, days in enumerate(days_old, 1):
            session.execute(
                text(
                    "INSERT INTO document.district_unions "
                    "(document_id, zone, geometry, created_at, updated_at) VALUES "
                    "(:d, :zone, ST_Multi(ST_GeomFromText("
                    "'POLYGON((0 0,1 0,1 1,0 0))', 4326)), now(), now() - :age)"
                ),
                {"d": plan, "zone": zone, "age": D * days},
            )
        set_plan(session, plan, assigned=False, assignments_updated_at=D * edited)

    def left(plan):
        return session.execute(
            text(
                "SELECT count(*) FROM document.district_unions WHERE document_id = :d"
            ),
            {"d": plan},
        ).scalar_one()

    return SimpleNamespace(a=document_id, b=b, rows=rows, left=left)


@pytest.mark.parametrize(
    "case, days_old, edited, evicted",
    [
        ("cache and last edit both over two weeks old", (15, 20), 15, True),
        ("one district rebuilt or read yesterday", (15, 1), 15, False),
        ("edited yesterday", (15, 20), 1, False),
        ("a day short of two weeks", (13, 13), 13, False),
    ],
)
def test_evicts_only_whole_plans_idle_for_two_weeks(
    unions, case, days_old, edited, evicted
):
    unions.rows(unions.a, *days_old, edited=edited)
    rows, nbytes = stats_refresh.evict_old_district_unions()
    assert (rows, nbytes > 0) == ((2, True) if evicted else (0, False)), case
    assert unions.left(unions.a) == (0 if evicted else 2), case


def test_eviction_takes_the_oldest_plans_first_and_stops_at_the_byte_cap(
    unions, monkeypatch
):
    monkeypatch.setattr(stats_refresh, "EVICT_BATCH", 1)  # one plan per DELETE
    unions.rows(unions.a, 15, edited=15)
    unions.rows(unions.b, 30, edited=30)

    assert stats_refresh.evict_old_district_unions(max_bytes=0) == (0, 0)  # off
    assert stats_refresh.evict_old_district_unions(max_bytes=1)[0] == 1
    assert (unions.left(unions.a), unions.left(unions.b)) == (1, 0)

    unions.rows(unions.b, 30, edited=30)
    monkeypatch.setattr(settings, "DISTRICT_UNIONS_EVICT_GB_PER_NIGHT", 10)
    assert stats_refresh.evict_old_district_unions()[0] == 2  # two batches
    assert (unions.left(unions.a), unions.left(unions.b)) == (0, 0)


@pytest.mark.parametrize("evict_fails", [False, True])
def test_nightly_pass_evicts_after_publishing_and_reports_a_failure(
    run, caplog, monkeypatch, evict_fails
):
    def evict():
        assert len(run.starts) == 3  # after the publishes
        if evict_fails:
            raise RuntimeError(UUID)
        return 7, 5_000_000

    monkeypatch.setattr(stats_refresh, "evict_old_district_unions", evict)
    run.failing = set()
    with caplog.at_level(logging.INFO):
        assert stats_refresh.refresh_stale_plans() == 3
    summary = caplog.records[-1]
    assert ("; eviction failed" in summary.message) == evict_fails
    assert summary.levelno == (logging.ERROR if evict_fails else logging.INFO)
    assert ("eviction: 7 rows, 5 MB in" in caplog.text) != evict_fails
    assert UUID not in caplog.text
