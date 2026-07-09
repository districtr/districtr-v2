"""Locust harness for the districtr production stress test.

Three populations (traffic model in README.md), all spawned at t=0. Each user
pre-computes its session-start offset (fixed RNG seed → reproducible), sleeps
until then, runs one session, and stops. Run headless with -u/-r set to the
total user count logged at startup, e.g.:

    locust --headless -f locustfile.py -u <total> -r <total> \
        -t <window+120>s --csv run --html run.html

See README.md for the full recipe.
"""

import itertools
import json
import logging
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from locust import FastHttpUser, events, task
from locust.exception import StopUser

import client as api_names
from client import StressClient
from config import load_config_rows, load_seed_manifest, settings
from scenario import (
    EDITOR_EVAL_FRACTION,
    EDITORS,
    EVAL_USERS,
    PERTURB_FRACTION,
    PLANS_PER_EDITOR,
    VIEWERS,
    editor_save_times,
    poisson_offsets,
    scaled,
    uniform_offsets,
)

logger = logging.getLogger(__name__)

WINDOW = settings.WINDOW_SECONDS
N_VIEWERS = scaled(VIEWERS, settings.SCALE)
N_EVAL = scaled(EVAL_USERS, settings.SCALE)
N_EDITORS = scaled(EDITORS, settings.SCALE)
N_EDITOR_EVAL = max(1, round(N_EDITORS * EDITOR_EVAL_FRACTION))
TOTAL_USERS = N_VIEWERS + N_EVAL + N_EDITORS

# Populated at init from the config JSON + seed manifest.
VIEW_DOCS: list[str] = []  # document_ids viewers/eval load
EDIT_DOCS: list[dict] = []  # {"document_id", "districtr_map_slug"} editors copy

TEST_START = time.monotonic()

# Run bookkeeping (gevent: single-threaded, no locking needed).
_created_documents: list[str] = []
_conflicts = 0
_editor_roundtrips = 0  # saves where the response updated_at advanced


def _flush_manifest() -> None:
    path = settings.runtime_manifest_path
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(
            {"run_id": settings.RUN_ID, "created_documents": _created_documents}, f
        )
    os.replace(tmp, path)


def _record_created(document_id: str) -> None:
    # Write-through on every create so the manifest is always flushed —
    # a SIGTERM abort (locust graceful shutdown) can't lose document ids.
    _created_documents.append(document_id)
    _flush_manifest()


@events.init.add_listener
def _load_seed_plans(environment, **kwargs):
    rows = load_config_rows()
    seed_docs = load_seed_manifest(settings.seed_manifest_path)
    use_by_slug = {r["districtr_map_slug"]: r.get("use", []) for r in rows}
    for doc in seed_docs:
        use = use_by_slug.get(doc["districtr_map_slug"])
        if use is None:
            logger.warning(
                "seed doc %s slug %s not in config %s; skipping",
                doc["document_id"],
                doc["districtr_map_slug"],
                settings.CONFIG_URL,
            )
            continue
        if "view" in use:
            VIEW_DOCS.append(doc["document_id"])
        if "edit" in use:
            EDIT_DOCS.append(doc)
    assert VIEW_DOCS, "no seed documents with use=view"
    assert EDIT_DOCS, "no seed documents with use=edit"
    logger.info(
        "run_id=%s scale=%s window=%ss users: %d viewers + %d eval + %d editors "
        "(%d w/ eval) = %d total (-u %d); %d view docs, %d edit docs",
        settings.RUN_ID,
        settings.SCALE,
        WINDOW,
        N_VIEWERS,
        N_EVAL,
        N_EDITORS,
        N_EDITOR_EVAL,
        TOTAL_USERS,
        TOTAL_USERS,
        len(VIEW_DOCS),
        len(EDIT_DOCS),
    )


@events.test_start.add_listener
def _mark_start(environment, **kwargs):
    global TEST_START
    TEST_START = time.monotonic()


class SessionUser(FastHttpUser):
    """One-shot user: sleep until the pre-sampled start offset, run one
    session, stop. Subclasses set fixed_count/offsets/_counter."""

    abstract = True
    host = settings.BASE_URL
    network_timeout = 180.0
    connection_timeout = 60.0
    offsets: list[float] = []
    _counter: "itertools.count[int]"

    def on_start(self):
        self.idx = next(type(self)._counter)
        self.rng = random.Random(
            f"{settings.RNG_SEED}:{type(self).__name__}:{self.idx}"
        )
        self.api = StressClient(self.client, settings.user_agent)

    def sleep_until(self, offset: float) -> None:
        delay = TEST_START + offset - time.monotonic()
        if delay > 0:
            time.sleep(delay)  # gevent-patched

    def start_offset(self) -> float:
        return self.offsets[self.idx % len(self.offsets)]


class Viewer(SessionUser):
    fixed_count = N_VIEWERS
    offsets = poisson_offsets(N_VIEWERS, WINDOW, settings.RNG_SEED, "viewer")
    _counter = itertools.count()

    @task
    def session(self):
        self.sleep_until(self.start_offset())
        document_id = self.rng.choice(VIEW_DOCS)
        if self.api.get_document(document_id):
            self.api.get_assignments(document_id)
        raise StopUser


class EvalUser(SessionUser):
    fixed_count = N_EVAL
    offsets = poisson_offsets(N_EVAL, WINDOW, settings.RNG_SEED, "eval")
    _counter = itertools.count()

    @task
    def session(self):
        self.sleep_until(self.start_offset())
        document_id = self.rng.choice(VIEW_DOCS)
        if self.api.get_document(document_id):
            self.api.get_assignments(document_id)
            self.api.get_evaluation(document_id)
        raise StopUser


class Editor(SessionUser):
    fixed_count = N_EDITORS
    offsets = uniform_offsets(N_EDITORS, WINDOW, settings.RNG_SEED, "editor")
    _counter = itertools.count()

    @task
    def session(self):
        global _conflicts, _editor_roundtrips
        start = self.start_offset()
        self.sleep_until(start)
        seed_doc = self.rng.choice(EDIT_DOCS)

        # Create 3 plans, all copies of the same seed (§3).
        plans = []
        for i in range(PLANS_PER_EDITOR):
            doc = self.api.create_document(
                seed_doc["districtr_map_slug"],
                copy_from_doc=seed_doc["document_id"],
                name=f"[STRESS-TEST] {settings.RUN_ID} editor {self.idx} plan {i}",
            )
            if doc:
                _record_created(doc["document_id"])
                plans.append(doc)
        if not plans:
            raise StopUser

        # Load the plan once (all copies are identical); saves are msgpack
        # full replacements of this set with a small zone perturbation.
        rows = self.api.get_assignments(plans[0]["document_id"])
        if not rows:
            raise StopUser
        pairs = [[geo_id, zone] for geo_id, zone, _parent in rows]
        num_districts = plans[0].get("num_districts") or max(
            (z for _, z in pairs if z is not None), default=1
        )

        do_eval = self.idx < N_EDITOR_EVAL
        for i, t in enumerate(
            editor_save_times(start, WINDOW, settings.RNG_SEED, self.idx)
        ):
            self.sleep_until(t)
            plan = plans[i % len(plans)]
            status, updated_at = self.api.put_assignments(
                plan["document_id"],
                self._perturbed(pairs, num_districts),
                last_updated_at=plan["updated_at"],
            )
            if status == "ok":
                if updated_at != plan["updated_at"]:
                    _editor_roundtrips += 1
                plan["updated_at"] = updated_at
            elif status == "conflict":
                _conflicts += 1
                refreshed = self.api.get_document(plan["document_id"])
                if refreshed:
                    plan["updated_at"] = refreshed["updated_at"]
            if do_eval and i == 1:
                # Guaranteed cache-cold: the save just bumped updated_at.
                self.api.get_evaluation(plan["document_id"])
        raise StopUser

    def _perturbed(self, pairs: list, num_districts: int) -> list:
        payload = [row[:] for row in pairs]
        for j in self.rng.sample(
            range(len(payload)), max(1, int(len(payload) * PERTURB_FRACTION))
        ):
            payload[j][1] = self.rng.randint(1, num_districts)
        return payload


SMOKE_CHECKS = [
    ("GET", api_names.DOCUMENT),
    ("GET", api_names.ASSIGNMENTS_GET),
    ("GET", api_names.EVALUATION),
    ("POST", api_names.CREATE_DOCUMENT),
    ("PUT", api_names.ASSIGNMENTS_PUT),
]


@events.quitting.add_listener
def _on_quit(environment, **kwargs):
    _flush_manifest()
    logger.info(
        "created %d documents (manifest: %s); %d save conflicts (409); "
        "%d saves round-tripped updated_at",
        len(_created_documents),
        settings.runtime_manifest_path,
        _conflicts,
        _editor_roundtrips,
    )
    if not settings.SMOKE_ASSERT:
        return
    problems = []
    for method, name in SMOKE_CHECKS:
        entry = environment.stats.get(name, method)
        if entry.num_requests == 0:
            problems.append(f"{method} {name}: no requests")
        elif entry.num_failures > 0:
            problems.append(f"{method} {name}: {entry.num_failures} failures")
    if _editor_roundtrips == 0:
        problems.append("no editor save round-tripped updated_at")
    if problems:
        logger.error("SMOKE ASSERT FAILED:\n  %s", "\n  ".join(problems))
        environment.process_exit_code = 1
    else:
        logger.info(
            "SMOKE ASSERT PASSED: all request classes 2xx, "
            "editor saves round-tripped updated_at"
        )
