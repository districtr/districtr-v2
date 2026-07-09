"""Thin client over Locust's HTTP session: msgpack encode/decode, User-Agent
tagging, and `name=` grouping so per-document URLs collapse into one stat per
route."""

import msgpack

# Canonical Locust stat names, one per route.
DOCUMENT = "/api/document/{id}"
ASSIGNMENTS_GET = "/api/get_assignments/{id}"
EVALUATION = "/api/document/{id}/evaluation"
CREATE_DOCUMENT = "/api/create_document"
ASSIGNMENTS_PUT = "/api/assignments"


class StressClient:
    """Wraps a Locust user's `client` with the districtr API calls the
    traffic model needs. Failures are marked on the Locust stats; methods
    return None (or ("conflict", None) for a 409 save) on failure."""

    def __init__(self, http, user_agent: str):
        self.http = http
        self.headers = {"User-Agent": user_agent}

    def get_document(self, document_id: str) -> dict | None:
        with self.http.get(
            f"/api/document/{document_id}",
            headers=self.headers,
            name=DOCUMENT,
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"HTTP {resp.status_code}")
                return None
            return resp.json()

    def get_assignments(self, document_id: str) -> list | None:
        """Returns [[geo_id, zone, parent_path], ...] (msgpack triples)."""
        with self.http.get(
            f"/api/get_assignments/{document_id}?format=msgpack",
            headers=self.headers,
            name=ASSIGNMENTS_GET,
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"HTTP {resp.status_code}")
                return None
            try:
                return msgpack.unpackb(resp.content, raw=False)
            except Exception as e:
                resp.failure(f"msgpack decode failed: {e}")
                return None

    def get_evaluation(self, document_id: str) -> dict | None:
        with self.http.get(
            f"/api/document/{document_id}/evaluation",
            headers=self.headers,
            name=EVALUATION,
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"HTTP {resp.status_code}")
                return None
            return resp.json()

    def create_document(
        self, districtr_map_slug: str, copy_from_doc: str, name: str
    ) -> dict | None:
        with self.http.post(
            "/api/create_document",
            json={
                "districtr_map_slug": districtr_map_slug,
                "copy_from_doc": copy_from_doc,
                "metadata": {"name": name},
            },
            headers=self.headers,
            name=CREATE_DOCUMENT,
            catch_response=True,
        ) as resp:
            if resp.status_code != 201:
                resp.failure(f"HTTP {resp.status_code}")
                return None
            return resp.json()

    def put_assignments(
        self, document_id: str, assignments: list, last_updated_at: str
    ) -> tuple[str, str | None]:
        """Full-replacement save (main.py:643). Body is msgpack
        {document_id, assignments: [[geo_id, zone], ...], last_updated_at,
        overwrite: false}; response is JSON {assignments_inserted, updated_at}.

        Returns ("ok", new_updated_at), ("conflict", None) for 409 (recorded
        on stats as a success — expected-but-noteworthy), or ("error", None).
        """
        body = msgpack.packb(
            {
                "document_id": document_id,
                "assignments": assignments,
                "last_updated_at": last_updated_at,
                "overwrite": False,
            }
        )
        with self.http.put(
            "/api/assignments",
            data=body,
            headers={
                **self.headers,
                "Content-Type": "application/msgpack",
                "Accept": "application/json",
            },
            name=ASSIGNMENTS_PUT,
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                return "ok", resp.json()["updated_at"]
            if resp.status_code == 409:
                resp.success()  # optimistic-concurrency conflict: non-fatal
                return "conflict", None
            resp.failure(f"HTTP {resp.status_code}")
            return "error", None
