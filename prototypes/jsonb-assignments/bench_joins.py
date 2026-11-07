"""Geometry-join reads: document.assignments vs jsonb expanded with jsonb_each_text.

Covers the SQL consumers (district_unions rebuild via get_zone_assignments_geo,
contiguity bboxes, thumbnails, exports). Read-only against the dev DB: the jsonb
copy lives in a session temp table.
    docker exec -i backend python - < bench_joins.py > joins.json
"""

import json
import statistics
import sys
import time

import psycopg

DOCS = {  # name: (document_id, parent layer, child layer)
    "CO 8k": (
        "3d8f5033-9088-4d12-94df-620d97fc7012",
        "co_districtr_vtd_view_v2",
        "co_districtr_block_view_v2",
    ),
    "TX 23k": (
        "d618e585-7aa9-4c6d-9e40-658efc3b3698",
        "tx_districtr_vtd_view_v2",
        "tx_districtr_block_view_v2",
    ),
    "KS 52k": (
        "22c820bc-7b09-488b-a706-061cdb945c16",
        "ks_districtr_vtd_view_v2",
        "ks_districtr_block_view_v2",
    ),
}

REL_SRC = "SELECT geo_id::text geo_id, zone FROM document.assignments WHERE document_id = %(d)s"
JS_SRC = (
    "SELECT e.key geo_id, e.value::int zone FROM tj, jsonb_each_text(tj.assignments) e"
    " WHERE tj.document_id = %(d)s"
)


def geo_join(src, parent, child, zone_filter=""):
    # Same shape as get_zone_assignments_geo for a shatterable map.
    return f"""WITH a AS ({src})
    SELECT a.geo_id, a.zone, p.geometry FROM a JOIN gerrydb.{parent} p ON p.path = a.geo_id {zone_filter}
    UNION ALL
    SELECT a.geo_id, a.zone, c.geometry FROM a JOIN gerrydb.{child} c ON c.path = a.geo_id {zone_filter}"""


def timed(conn, sql, params, reps):
    lat = []
    for _ in range(reps):
        t0 = time.perf_counter()
        conn.execute(sql, params).fetchall()
        lat.append((time.perf_counter() - t0) * 1000)
    return round(statistics.median(lat), 1)


out = []
with psycopg.connect(
    "host=db dbname=districtr user=postgres password=postgres", autocommit=True
) as conn:
    conn.execute("SET temp_buffers = '256MB'")
    conn.execute(
        "CREATE TEMP TABLE tj (document_id uuid PRIMARY KEY, assignments jsonb)"
    )
    conn.execute(
        "INSERT INTO tj SELECT document_id, jsonb_object_agg(geo_id, zone) FROM document.assignments"
        " WHERE document_id = ANY(%s::uuid[]) GROUP BY 1",
        ([d for d, _, _ in DOCS.values()],),
    )
    conn.execute("ANALYZE tj")
    for name, (doc, parent, child) in DOCS.items():
        p = {"d": doc}
        big_zone = conn.execute(
            "SELECT zone FROM document.assignments WHERE document_id = %s AND zone IS NOT NULL GROUP BY 1"
            " ORDER BY count(*) DESC LIMIT 1",
            (doc,),
        ).fetchone()[0]
        for label, src in (("rel", REL_SRC), ("jsonb", JS_SRC)):
            join = geo_join(src, parent, child)
            row = {"doc": name, "src": label}
            row["join_all_ms"] = timed(
                conn,
                f"SELECT count(*), sum(st_npoints(geometry)) FROM ({join}) g",
                p,
                7,
            )
            row["bbox_zone_ms"] = timed(
                conn,
                "SELECT geo_id, st_xmin(Box2D(geometry)), st_ymax(Box2D(geometry)) FROM ("
                + geo_join(src, parent, child, f"WHERE a.zone = {big_zone}")
                + ") g",
                p,
                7,
            )
            row["union_zone_ms"] = timed(
                conn,
                "SELECT ST_AsGeoJSON(ST_Multi(ST_Transform(ST_UnaryUnion(ST_Collect(geometry)), 4326)))"
                f" FROM ({geo_join(src, parent, child, f'WHERE a.zone = {big_zone}')}) g",
                p,
                3,
            )
            plan = conn.execute(
                f"EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FROM ({join}) g", p
            ).fetchone()[0][0]["Plan"]
            # Join strategy chosen for the parent-layer branch.
            nodes, stack = [], [plan]
            while stack:
                n = stack.pop()
                if "Join" in n["Node Type"] or n["Node Type"] == "Nested Loop":
                    nodes.append(
                        f'{n["Node Type"]} est={n["Plan Rows"]} actual={n["Actual Rows"]}'
                    )
                stack.extend(n.get("Plans", []))
            row["joins"] = nodes
            out.append(row)
            print(row, file=sys.stderr, flush=True)
print(json.dumps(out, indent=1))
