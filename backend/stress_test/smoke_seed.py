"""Minimal HTTP seeder for local smoke runs: creates one document per config
row (with its assignments) and writes the seed manifest the locustfile reads.

    STRESS_CONFIG_URL=fixtures/local_config.json STRESS_RUN_ID=smoke \
        python smoke_seed.py

Production seeding is WS2's `stress-test-seed` CLI command (see
STRESS_TEST_PLAN.md §5); this script only exists so WS1 smoke runs don't
depend on it. Both write the same manifest shape:
    {"run_id": ..., "documents": [{"document_id", "districtr_map_slug", "use"}]}
"""

import json

import msgpack
import requests

from config import (
    _read_url_or_file,
    load_config_rows,
    resolve_assignments_path,
    settings,
)


def main() -> None:
    headers = {"User-Agent": settings.user_agent}
    documents = []
    for row in load_config_rows():
        slug = row["districtr_map_slug"]
        pairs = msgpack.unpackb(
            _read_url_or_file(
                resolve_assignments_path(row["assignments_path"], settings.CONFIG_URL)
            ),
            raw=False,
        )
        resp = requests.post(
            f"{settings.BASE_URL}/api/create_document",
            json={
                "districtr_map_slug": slug,
                "metadata": {"name": f"[STRESS-TEST] {settings.RUN_ID} seed {slug}"},
            },
            headers=headers,
        )
        resp.raise_for_status()
        doc = resp.json()
        save = requests.put(
            f"{settings.BASE_URL}/api/assignments",
            data=msgpack.packb(
                {
                    "document_id": doc["document_id"],
                    "assignments": pairs,
                    "last_updated_at": doc["updated_at"],
                }
            ),
            headers={**headers, "Content-Type": "application/msgpack"},
        )
        save.raise_for_status()
        documents.append(
            {
                "document_id": doc["document_id"],
                "districtr_map_slug": slug,
                "use": row["use"],
            }
        )
        print(f"seeded {slug}: {doc['document_id']} ({len(pairs)} assignments)")

    with open(settings.seed_manifest_path, "w") as f:
        json.dump({"run_id": settings.RUN_ID, "documents": documents}, f, indent=2)
    print(f"wrote {settings.seed_manifest_path}")


if __name__ == "__main__":
    main()
