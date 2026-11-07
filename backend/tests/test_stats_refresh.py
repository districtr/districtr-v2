from datetime import datetime, timedelta, timezone
from time import monotonic
from unittest.mock import Mock

import pytest
from sqlalchemy import text, update

from app import stats_refresh
from app.models import Assignments, Document

NOW = datetime.now(timezone.utc)


def set_plan(session, document_id, *, assigned=True, **values):
    if assigned:
        session.add(
            Assignments(document_id=document_id, geo_id="202090441022004", zone=1)
        )
    stamp = NOW - timedelta(hours=2)
    values = {
        "assignments_updated_at": stamp,
        "updated_at": stamp,
        "stats_published_at": None,
        **values,
    }
    session.execute(
        update(Document).where(Document.document_id == document_id).values(**values)
    )
    session.commit()


@pytest.mark.parametrize(
    "case, values, assigned, picked",
    [
        ("idle and stale", {}, True, True),
        ("saved 10 min ago", {"updated_at": NOW - timedelta(minutes=10)}, True, False),
        (
            "zones changed 10 min ago",
            {"assignments_updated_at": NOW - timedelta(minutes=10)},
            True,
            False,
        ),
        (
            "older than lookback",
            {
                "assignments_updated_at": NOW - timedelta(days=3),
                "updated_at": NOW - timedelta(days=3),
            },
            True,
            False,
        ),
        ("already published", {"stats_published_at": NOW}, True, False),
        ("community map", {"map_type": "community"}, True, False),
        ("untouched blank", {}, False, False),
        (
            "published plan since cleared",
            {"stats_published_at": NOW - timedelta(hours=3)},
            False,
            True,
        ),
    ],
)
def test_picks_only_stale_plans_idle_for_an_hour(
    session, document_id, case, values, assigned, picked
):
    set_plan(session, document_id, assigned=assigned, **values)
    ids = [str(d) for d, _ in stats_refresh.stale_idle_plans(session)]
    assert (str(document_id) in ids) == picked, case


@pytest.fixture
def runner(engine, monkeypatch):
    monkeypatch.setattr(stats_refresh, "engine", engine)
    monkeypatch.setattr(
        stats_refresh,
        "stale_idle_plans",
        lambda session: [("a", 1), ("b", 2), ("c", 3)],
    )
    calls = []

    def publish(document_id, public_id):
        calls.append((public_id, monotonic()))
        if public_id == 2:
            raise RuntimeError("S3 down")

    monkeypatch.setattr(stats_refresh, "publish_district_stats_to_s3", publish)
    return calls


def test_rebuilds_are_spread_out_and_one_failure_does_not_stop_the_run(runner):
    assert stats_refresh.refresh_stale_plans(spread_seconds=0.6) == 2
    assert [public_id for public_id, _ in runner] == [1, 2, 3]
    gaps = [b - a for (_, a), (_, b) in zip(runner, runner[1:])]
    assert all(gap >= 0.19 for gap in gaps), gaps  # 0.6 s / 3 plans


def test_only_one_process_runs_at_a_time(engine, runner):
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as other:
        other.execute(
            text("SELECT pg_advisory_lock(:k)"), {"k": stats_refresh.LOCK_KEY}
        )
        assert stats_refresh.refresh_stale_plans(spread_seconds=0) == 0
        other.execute(
            text("SELECT pg_advisory_unlock(:k)"), {"k": stats_refresh.LOCK_KEY}
        )
    assert runner == []
    # Released after each run, so the next night's run gets it.
    assert stats_refresh.refresh_stale_plans(spread_seconds=0) == 2
    assert stats_refresh.refresh_stale_plans(spread_seconds=0) == 2


def test_wakes_at_start_hour_utc(monkeypatch):
    sleeps = []
    monkeypatch.setattr(stats_refresh, "time", lambda: 7 * 3600 + 1800.0)  # 07:30 UTC
    monkeypatch.setattr(stats_refresh, "sleep", lambda s: sleeps.append(s))
    run = Mock(side_effect=SystemExit)  # stop the loop after one wake
    monkeypatch.setattr(stats_refresh, "refresh_stale_plans", run)
    with pytest.raises(SystemExit):
        stats_refresh._run_nightly()
    assert sleeps == [1800.0]
    run.assert_called_once()
