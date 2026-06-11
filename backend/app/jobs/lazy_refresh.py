"""Low-priority background refresh of district stats + thumbnails for settled plans.

Live `/stats` requests keep the `district_unions` table (and the thumbnail derived
from it) fresh for plans people are actively viewing. Plans that were finished and
left alone never get re-requested, so their precomputed output drifts out of sync
with the saved assignments. This module sweeps for those plans on a timer and lazily
brings them back in sync, well behind live traffic in priority.

"Lower priority" is enforced by several safeguards, none of which block a request:

* A single worker drains the queue one plan at a time (no fan-out onto the DB).
* The heavy stats/thumbnail work runs in a thread (`asyncio.to_thread`) so it never
  holds the event loop hostage from request handlers.
* A throttle delay separates jobs, so refreshes trickle instead of bursting.
* The queue is bounded and de-duplicated; overflow is dropped and re-found next sweep.
* Each sweep enqueues at most ``LAZY_REFRESH_BATCH_LIMIT`` plans.
* Every job re-checks freshness before doing work, so nothing is recomputed twice.
"""

import asyncio
import logging

from sqlalchemy import bindparam, text
from sqlmodel import Session

from app.core.config import settings
from app.core.db import engine
from app.models import UUIDType
from app.thumbnails.main import THUMBNAIL_BUCKET, generate_thumbnail
from app.utils import district_stats_in_sync, update_or_select_district_stats

logger = logging.getLogger(__name__)

# Cheap candidate selection: settled, out-of-sync district plans plus the two facts
# needed to decide qualification (completeness + district count). Deliberately does
# NOT count distinct zones here — a correlated count over the partitioned assignments
# table can't prune partitions and would scan every partition per candidate. The
# count is done per-candidate below with a constant document_id, which prunes to one
# partition.
_CANDIDATES_SQL = text("""
    SELECT
        d.document_id,
        (d.map_metadata ->> 'draft_status') = 'ready_to_share' AS is_complete,
        COALESCE(d.num_districts, dm.num_districts) AS num_districts
    FROM document.document d
    JOIN districtrmap dm ON dm.districtr_map_slug = d.districtr_map_slug
    WHERE d.document_type = 'district'
      AND d.updated_at < NOW() - (:stale_minutes * INTERVAL '1 minute')
      AND NOT EXISTS (
          SELECT 1
          FROM document.district_unions du
          WHERE du.document_id = d.document_id
            AND du.updated_at > d.updated_at
      )
    ORDER BY d.updated_at ASC
""")

# Per-candidate distinct-zone count. The constant document_id lets PostgreSQL prune
# to the single matching assignments partition.
_ZONE_COUNT_SQL = text("""
    SELECT COUNT(DISTINCT zone)
    FROM document.assignments
    WHERE document_id = :document_id
      AND zone IS NOT NULL
""").bindparams(bindparam(key="document_id", type_=UUIDType))


def find_stale_plan_ids(session: Session, limit: int) -> list[str]:
    """Return document_ids of saved district plans whose district_unions are stale.

    A plan qualifies only when ALL of these hold:

    * it is a district plan,
    * it has not been saved within the staleness window (it has settled),
    * its district_unions output is older than the document (out of sync with /stats),
    * AND it is either marked complete (``ready_to_share``) or fully zoned — its number
      of distinct assigned zones equals the plan's district count. The fully-zoned
      branch needs a known district count; the "complete" branch does not.

    Done in two phases so the distinct-zone count stays partition-pruned: a cheap
    query selects oldest-first candidates, then each non-complete candidate is counted
    individually. Returns at most ``limit`` ids.
    """
    candidates = session.execute(
        _CANDIDATES_SQL,
        {"stale_minutes": settings.LAZY_REFRESH_STALE_MINUTES},
    ).all()

    stale: list[str] = []
    for document_id, is_complete, num_districts in candidates:
        if len(stale) >= limit:
            break
        if is_complete:
            stale.append(str(document_id))
            continue
        if num_districts is None:
            continue  # fully-zoned check needs a known district count
        zone_count = session.execute(
            _ZONE_COUNT_SQL, {"document_id": document_id}
        ).scalar_one()
        if zone_count == num_districts:
            stale.append(str(document_id))
    return stale


def refresh_document(document_id: str) -> bool:
    """Recompute district stats and the thumbnail for one document.

    Synchronous and self-contained: owns short-lived sessions so it never touches a
    request-scoped connection, and is meant to run in a worker thread. Re-checks
    freshness first, so a plan refreshed since it was queued is skipped cheaply.

    Returns True if work ran, False if the plan was already in sync.
    """
    with Session(engine) as session:
        if district_stats_in_sync(session, document_id):
            return False

    # Recompute and commit district_unions. Passing no BackgroundTasks means stats
    # will not schedule its own thumbnail — we own that step below instead.
    with Session(engine) as session:
        update_or_select_district_stats(session, document_id)

    if settings.get_s3_client():
        generate_thumbnail(
            document_id=document_id,
            out_directory=THUMBNAIL_BUCKET,
        )
    return True


# --- Queue + workers -------------------------------------------------------------

_queue: asyncio.Queue[str] | None = None
_pending: set[str] = set()
_tasks: list[asyncio.Task] = []


def _get_queue() -> asyncio.Queue[str]:
    global _queue
    if _queue is None:
        _queue = asyncio.Queue(maxsize=settings.LAZY_REFRESH_QUEUE_MAXSIZE)
    return _queue


async def enqueue_refresh(document_id: str) -> bool:
    """Queue a document for lazy refresh, de-duplicating ids already in flight.

    Never blocks: returns False if the id is already queued or the queue is full (the
    next sweep will re-discover it), True if it was newly enqueued.
    """
    if document_id in _pending:
        return False
    queue = _get_queue()
    try:
        queue.put_nowait(document_id)
    except asyncio.QueueFull:
        logger.warning("Lazy-refresh queue full; deferring %s", document_id)
        return False
    _pending.add(document_id)
    return True


async def _worker() -> None:
    """Drain the queue one plan at a time, doing the heavy work off the event loop."""
    queue = _get_queue()
    while True:
        document_id = await queue.get()
        try:
            ran = await asyncio.to_thread(refresh_document, document_id)
            if ran:
                logger.info("Lazy refresh complete for %s", document_id)
        except Exception:
            logger.exception("Lazy refresh failed for %s", document_id)
        finally:
            _pending.discard(document_id)
            queue.task_done()
        # Throttle so refreshes trickle and never crowd out live request traffic.
        await asyncio.sleep(settings.LAZY_REFRESH_THROTTLE_SECONDS)


async def sweep_once() -> int:
    """Find stale plans and enqueue them. Returns the number newly enqueued."""

    def _query() -> list[str]:
        with Session(engine) as session:
            return find_stale_plan_ids(session, settings.LAZY_REFRESH_BATCH_LIMIT)

    stale_ids = await asyncio.to_thread(_query)
    queued = 0
    for document_id in stale_ids:
        if await enqueue_refresh(document_id):
            queued += 1
    if stale_ids:
        logger.info(
            "Lazy-refresh sweep queued %d/%d stale plans", queued, len(stale_ids)
        )
    return queued


async def _sweep_loop() -> None:
    """Run a sweep every interval. Sleeps first so startup isn't a thundering herd."""
    while True:
        await asyncio.sleep(settings.LAZY_REFRESH_INTERVAL_SECONDS)
        try:
            await sweep_once()
        except Exception:
            logger.exception("Lazy-refresh sweep failed")


def start() -> None:
    """Start the worker + periodic sweep. No-op if disabled or already running."""
    if not settings.LAZY_REFRESH_ENABLED:
        logger.info("Lazy refresh disabled; not starting background tasks")
        return
    if _tasks:
        return
    _tasks.append(asyncio.create_task(_worker(), name="lazy-refresh-worker"))
    _tasks.append(asyncio.create_task(_sweep_loop(), name="lazy-refresh-sweep"))
    logger.info("Lazy-refresh background tasks started")


async def stop() -> None:
    """Cancel and await the background tasks. Safe to call when none are running."""
    for task in _tasks:
        task.cancel()
    for task in _tasks:
        try:
            await task
        except asyncio.CancelledError:
            pass
    _tasks.clear()
