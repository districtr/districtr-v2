import asyncio

import pytest
from sqlalchemy import text

from app.jobs import lazy_refresh
from app.utils import district_stats_in_sync, update_or_select_district_stats


def _backdate_and_set_status(session, document_id, *, minutes=25, draft_status=None):
    """Backdate a document's updated_at past the staleness window.

    Optionally overwrite map_metadata with a draft_status so we can exercise the
    "marked complete" branch. Done in one UPDATE so updated_at isn't bumped again.
    """
    metadata_sql = ""
    params = {"document_id": document_id, "minutes": minutes}
    if draft_status is not None:
        metadata_sql = ", map_metadata = :metadata"
        params["metadata"] = f'{{"draft_status": "{draft_status}"}}'
    session.execute(
        text(f"""
            UPDATE document.document
            SET updated_at = NOW() - (:minutes * INTERVAL '1 minute'){metadata_sql}
            WHERE document_id = :document_id
        """),
        params,
    )


def test_find_stale_plan_ids_complete_then_in_sync(
    client,
    assignments_document_id,
    ks_demo_view_census_blocks_summary_stats_all_stats,
    session,
):
    """A settled, complete plan with no fresh stats is stale; after /stats it isn't."""
    document_id = assignments_document_id  # num_districts=4, 2 zones assigned

    # Not complete and not fully zoned -> not a refresh candidate yet.
    _backdate_and_set_status(session, document_id)
    assert document_id not in lazy_refresh.find_stale_plan_ids(session, limit=50)

    # Marking it complete makes it a candidate even though it isn't fully zoned.
    _backdate_and_set_status(session, document_id, draft_status="ready_to_share")
    assert document_id in lazy_refresh.find_stale_plan_ids(session, limit=50)

    # Computing stats brings district_unions in sync, so it drops out again.
    response = client.get(f"/api/document/{document_id}/stats")
    assert response.status_code == 200
    assert district_stats_in_sync(session, document_id) is True
    assert document_id not in lazy_refresh.find_stale_plan_ids(session, limit=50)


def test_find_stale_plan_ids_fully_zoned(
    client,
    document_id_all_stats,
    ks_demo_view_census_blocks_summary_stats_all_stats,
    session,
):
    """A plan whose distinct assigned zones == num_districts qualifies without status."""
    document_id = document_id_all_stats  # all_stats map has num_districts=4

    response = client.put(
        "/api/assignments",
        json={
            "document_id": document_id,
            "assignments": [
                ["202090441022004", 1],
                ["202090428002008", 2],
                ["202090443032011", 3],
                ["200979691001108", 4],
            ],
            "last_updated_at": "2024-01-01T00:00:00+00:00",
        },
    )
    assert response.status_code == 200

    # Fresh save (updated within the window) -> excluded.
    assert document_id not in lazy_refresh.find_stale_plan_ids(session, limit=50)

    # Settled with all four zones assigned -> included.
    _backdate_and_set_status(session, document_id)
    assert document_id in lazy_refresh.find_stale_plan_ids(session, limit=50)


def test_find_stale_plan_ids_skips_incomplete_without_num_districts(
    client, document_id, session
):
    """An incomplete plan on a map with no num_districts can't be 'fully zoned'."""
    # The document_id fixture's map is created without num_districts and the plan is
    # not marked complete, so neither qualifying branch applies.
    _backdate_and_set_status(session, document_id)
    assert document_id not in lazy_refresh.find_stale_plan_ids(session, limit=50)


def test_stats_without_background_tasks_recomputes(
    client,
    assignments_document_id,
    ks_demo_view_census_blocks_summary_stats_all_stats,
    session,
):
    """update_or_select_district_stats works with no request-scoped BackgroundTasks."""
    rows = update_or_select_district_stats(session, assignments_document_id)
    assert rows  # recomputed district_unions rows returned
    assert district_stats_in_sync(session, assignments_document_id) is True


def test_enqueue_refresh_dedupes():
    """In-flight ids are de-duplicated so a plan is never queued twice at once."""
    lazy_refresh._queue = None
    lazy_refresh._pending.clear()

    async def scenario():
        first = await lazy_refresh.enqueue_refresh("doc-1")
        duplicate = await lazy_refresh.enqueue_refresh("doc-1")
        other = await lazy_refresh.enqueue_refresh("doc-2")
        return first, duplicate, other, lazy_refresh._get_queue().qsize()

    try:
        first, duplicate, other, size = asyncio.run(scenario())
        assert first is True
        assert duplicate is False
        assert other is True
        assert size == 2
    finally:
        lazy_refresh._queue = None
        lazy_refresh._pending.clear()


def test_enqueue_refresh_respects_queue_maxsize(monkeypatch):
    """A full queue defers extra ids rather than blocking or growing unbounded."""
    monkeypatch.setattr(
        lazy_refresh.settings, "LAZY_REFRESH_QUEUE_MAXSIZE", 1, raising=False
    )
    lazy_refresh._queue = None
    lazy_refresh._pending.clear()

    async def scenario():
        accepted = await lazy_refresh.enqueue_refresh("doc-1")
        deferred = await lazy_refresh.enqueue_refresh("doc-2")  # queue full
        return accepted, deferred

    try:
        accepted, deferred = asyncio.run(scenario())
        assert accepted is True
        assert deferred is False
    finally:
        lazy_refresh._queue = None
        lazy_refresh._pending.clear()


@pytest.mark.parametrize("enabled", [False])
def test_start_noop_when_disabled(monkeypatch, enabled):
    """start() does nothing (and spawns no tasks) when the feature flag is off."""
    monkeypatch.setattr(
        lazy_refresh.settings, "LAZY_REFRESH_ENABLED", enabled, raising=False
    )
    lazy_refresh._tasks.clear()

    async def scenario():
        lazy_refresh.start()
        return list(lazy_refresh._tasks)

    tasks = asyncio.run(scenario())
    assert tasks == []
