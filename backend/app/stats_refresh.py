"""Nightly rebuild of stale district stats for plans nobody is editing (ADR 0067).

Saves only invalidate the districts they change; the union rebuild, CDN
publish and thumbnail (ADR 0047) wait for this overnight pass, so a classroom
saving big plans at once doesn't stack spatial unions on the database.
Viewing, exporting or evaluating a plan still rebuilds its missing districts
on demand.

The same pass then evicts district_unions rows of plans untouched for two
weeks (ADR 0069), to keep the table small.

To run a pass by hand (after a deploy lands in the window, say):
`python cli.py refresh-stale-stats`.
"""

import logging
import threading
from datetime import timedelta
from time import monotonic, sleep, time

from sqlalchemy import exists, func, or_, text
from sqlmodel import Session, select

from app.core.config import settings
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
# A missed night (deploy, crash, scale-in) catches up the next one; anything
# older rebuilds on its next view instead. Plus IDLE: a plan saved in the hour
# before START_HOUR_UTC first qualifies the next night, and must survive one
# missed night after that too.
LOOKBACK = timedelta(days=2) + IDLE
# One runner across every backend process. Negative so it can't collide with
# the per-plan stats locks, which are keyed by (positive) public_id. The
# evaluation locks hash document_id over the whole bigint range; a collision
# there is ~2^-64 and would only delay one evaluation.
LOCK_KEY = -734817263
EVICT_AFTER = timedelta(days=14)
EVICT_BATCH = 500  # plans per DELETE, to stay well under statement_timeout


def stale_idle_plans(
    session: Session, document_id: str | None = None
) -> list[tuple[str, int]]:
    """(document_id, public_id) of plans whose published stats are stale;
    pass document_id to re-check just that plan."""
    now = func.now()
    query = select(Document.document_id, Document.public_id).where(
        Document.map_type != "community",
        Document.public_id.is_not(None),
        func.greatest(Document.updated_at, Document.assignments_updated_at)
        < now - IDLE,
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
    if document_id is not None:
        query = query.where(Document.document_id == document_id)
    else:
        query = query.where(Document.assignments_updated_at > now - LOOKBACK)
    return list(session.exec(query.order_by(Document.assignments_updated_at)).all())


def evict_old_district_unions() -> int:
    """Delete the cached district_unions rows of every plan whose cache and
    assignments are both older than EVICT_AFTER. Whole plans only: thumbnails
    read the table as-is, so a partly evicted plan would draw with districts
    missing. Returns the number of rows deleted."""
    # ponytail: each batch re-scans the table to find old plans; add an
    # index on updated_at if the scan gets slow.
    evict = text(
        """
        DELETE FROM document.district_unions
        WHERE document_id IN (
            SELECT du.document_id
            FROM document.district_unions du
            JOIN document.document d USING (document_id)
            GROUP BY du.document_id, d.assignments_updated_at
            HAVING greatest(max(du.updated_at), d.assignments_updated_at)
                < now() - :age
            LIMIT :batch
        )
        """
    )
    deleted = 0
    while True:
        with Session(engine) as session:
            n = session.execute(
                evict, {"age": EVICT_AFTER, "batch": EVICT_BATCH}
            ).rowcount
            session.commit()
        if not n:
            return deleted
        deleted += n


def _safe_reason(e: Exception) -> str:
    """Exception type plus a detail that can't carry the document UUID:
    an HTTP status (504 = per-plan lock wait) or a Postgres SQLSTATE (57014 =
    statement timeout). Never str(e): SQLAlchemy messages carry bound params."""
    detail = getattr(e, "status_code", None) or getattr(
        getattr(e, "orig", None), "sqlstate", None
    )
    return f"{type(e).__name__} {detail}" if detail else type(e).__name__


def refresh_stale_plans(spread_seconds: float = SPREAD_SECONDS) -> int:
    """Publish each stale idle plan, one at a time, evenly spaced across
    spread_seconds. Returns the number published; 0 if another process holds
    the run."""
    # Session-level lock on its own connection, as in _try_eval_lock (ADR
    # 0064). Not AUTOCOMMIT: the pool's checkout SETs leave the connection in
    # a transaction, and psycopg refuses to switch then. Commit right after
    # acquiring instead (the lock outlives it), so the connection sits idle,
    # not idle in transaction, for the hours the run takes.
    with engine.connect() as lock:
        try:
            acquired = lock.execute(
                text("SELECT pg_try_advisory_lock(:key)"), {"key": LOCK_KEY}
            ).scalar_one()
            lock.commit()
        except BaseException:
            lock.invalidate()  # may hold the lock; never return it to the pool
            raise
        if not acquired:
            return 0
        try:
            with Session(engine) as session:
                plans = stale_idle_plans(session)
            gap = spread_seconds / max(len(plans), 1)
            logger.info(
                "Nightly stats refresh: %s stale plans, one every %.0f s",
                len(plans),
                gap,
            )
            start = monotonic()
            published = skipped = failed = 0
            for i, (document_id, public_id) in enumerate(plans):
                if monotonic() - start > STOP_SECONDS:
                    break
                sleep(max(0.0, start + i * gap - monotonic()))
                try:
                    # Picked at 08:00 but its slot may be hours later: skip a
                    # plan whose owner is back editing (or that a viewer just
                    # published). The next night retries it.
                    with Session(engine) as session:
                        still_due = bool(stale_idle_plans(session, document_id))
                    if still_due and publish_district_stats_to_s3(
                        document_id, public_id
                    ):
                        published += 1
                    else:
                        skipped += 1
                except Exception as e:
                    failed += 1
                    # Never log the edit-capability UUID (or SQL params holding it).
                    logger.warning(
                        "Nightly stats refresh failed for plan %s: %s",
                        public_id,
                        _safe_reason(e),
                    )
            # After the publishes: a plan just republished has fresh rows and
            # is kept.
            try:
                logger.info(
                    "Nightly stats refresh: evicted %s old district_unions rows",
                    evict_old_district_unions(),
                )
            except Exception as e:
                logger.error("District unions eviction failed: %s", _safe_reason(e))
            left = len(plans) - published - skipped - failed
            # ERROR (a Sentry event) when a plan failed or the run ran out of
            # time, so a plan that fails every night or a backlog that never
            # finishes gets noticed.
            logger.log(
                logging.ERROR if failed or left else logging.INFO,
                "Nightly stats refresh: published %s, skipped %s, failed %s, "
                "left for tomorrow %s, in %.0f s",
                published,
                skipped,
                failed,
                left,
                monotonic() - start,
            )
            return published
        finally:
            try:
                lock.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": LOCK_KEY})
                lock.commit()
            except Exception:
                # The pool's reset-on-return is a rollback, which keeps
                # session locks: discard the connection so closing its
                # backend releases the lock.
                lock.invalidate()


def _run_nightly() -> None:
    while True:
        # Every process wakes at the same moment and races for the lock.
        sleep((START_HOUR_UTC * 3600 - time()) % 86400)
        try:
            refresh_stale_plans()
        except Exception as e:
            # No traceback: Sentry attaches frame locals, which hold document
            # UUIDs here.
            logger.error("Nightly stats refresh crashed: %s", _safe_reason(e))


def start_nightly_stats_refresh() -> None:
    """Start the nightly pass in this process, if S3 is configured (publishing
    needs it)."""
    if settings.get_s3_client() is None or not settings.AWS_S3_BUCKET:
        logger.info("Nightly stats refresh disabled: S3 is not configured")
        return
    # Daemon: process exit abandons an in-flight run; its plans stay stale
    # and the next night picks them up.
    threading.Thread(target=_run_nightly, name="stats-refresh", daemon=True).start()
    logger.info("Nightly stats refresh scheduled for %02d:00 UTC", START_HOUR_UTC)
