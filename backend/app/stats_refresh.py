"""Nightly rebuild of stale district stats for plans nobody is editing.

Saves only invalidate the districts they change; the union rebuild, CDN
publish and thumbnail (ADR 0047) wait for this overnight pass, so a classroom
saving big plans at once doesn't stack spatial unions on the database.
Viewing, exporting or evaluating a plan still rebuilds its missing districts
on demand.
"""

import logging
import threading
from datetime import timedelta
from time import monotonic, sleep, time

from sqlalchemy import exists, func, or_, text
from sqlmodel import Session, select

from app.core.db import engine
from app.models import Assignments, Document
from app.utils import publish_district_stats_to_s3

logger = logging.getLogger(__name__)

START_HOUR_UTC = 8  # 3 am Eastern, midnight Pacific (standard time)
SPREAD_SECONDS = 3 * 3600  # rebuilds spaced evenly across 08:00-11:00 UTC
# Running behind (slow rebuilds): stop by noon UTC, 7 am Eastern, and leave
# the rest for the next night.
STOP_SECONDS = 4 * 3600
IDLE = timedelta(hours=1)  # no saves for an hour: the editing session is over
# A missed night (deploy, crash) catches up the next one; anything older
# rebuilds on its next view instead.
LOOKBACK = timedelta(days=2)
# One runner across every backend process. Negative so it can't collide with
# the per-plan stats locks, which are keyed by (positive) public_id.
LOCK_KEY = -734817263


def stale_idle_plans(session: Session) -> list[tuple[str, int]]:
    """(document_id, public_id) of plans whose published stats are stale."""
    now = func.now()
    # ponytail: seq scan of document once a night; index assignments_updated_at if it gets slow.
    return list(
        session.exec(
            select(Document.document_id, Document.public_id)
            .where(
                Document.map_type != "community",
                Document.public_id.is_not(None),
                func.greatest(Document.updated_at, Document.assignments_updated_at)
                < now - IDLE,
                Document.assignments_updated_at > now - LOOKBACK,
                or_(
                    Document.stats_published_at.is_(None),
                    Document.stats_published_at < Document.assignments_updated_at,
                ),
                # Skip untouched blank plans, but republish published plans
                # that were cleared.
                or_(
                    Document.stats_published_at.is_not(None),
                    exists().where(Assignments.document_id == Document.document_id),
                ),
            )
            .order_by(Document.assignments_updated_at)
        ).all()
    )


def refresh_stale_plans(spread_seconds: float = SPREAD_SECONDS) -> int:
    """Publish each stale idle plan, one at a time, evenly spaced across
    spread_seconds. Returns the number published; 0 if another process holds
    the run."""
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as lock:
        if not lock.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": LOCK_KEY}
        ).scalar_one():
            return 0
        try:
            with Session(engine) as session:
                plans = stale_idle_plans(session)
            gap = spread_seconds / max(len(plans), 1)
            start = monotonic()
            published = 0
            for i, (document_id, public_id) in enumerate(plans):
                if monotonic() - start > STOP_SECONDS:
                    break
                sleep(max(0.0, start + i * gap - monotonic()))
                try:
                    publish_district_stats_to_s3(document_id, public_id)
                    published += 1
                except Exception as e:
                    # Never log the edit-capability UUID (or SQL params holding it).
                    logger.warning(
                        "Nightly stats refresh failed for plan %s: %s",
                        public_id,
                        type(e).__name__,
                    )
            logger.info(
                "Nightly stats refresh published %s of %s plans", published, len(plans)
            )
            return published
        finally:
            lock.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": LOCK_KEY})


def _run_nightly() -> None:
    while True:
        # Every process wakes at the same moment and races for the lock.
        sleep((START_HOUR_UTC * 3600 - time()) % 86400)
        try:
            refresh_stale_plans()
        except Exception:
            logger.exception("Nightly stats refresh crashed")


def start_nightly_stats_refresh() -> None:
    # Daemon: process exit abandons an in-flight run; its plans stay stale
    # and the next night picks them up.
    threading.Thread(target=_run_nightly, name="stats-refresh", daemon=True).start()
