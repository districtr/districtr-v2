"""Relational vs single-row jsonb assignments: storage + write benchmark.

Run inside the backend container (it can reach host `db`):
    docker exec -i backend python - < bench_writes.py > writes.json

Builds a throwaway database `districtr_bench` from a copy of the dev DB's
document.assignments (never writes to `districtr`). Prints JSON results.
"""

import json
import random
import statistics
import sys
import time
import uuid

import psycopg

PG = "host=db user=postgres password=postgres dbname="
SRC, BENCH = PG + "districtr", PG + "districtr_bench"

DOCS = {
    "OR 1k": "16c63022-2d15-4a66-a116-1d0c82f60af3",
    "CO 8k": "3d8f5033-9088-4d12-94df-620d97fc7012",
    "TX 23k": "d618e585-7aa9-4c6d-9e40-658efc3b3698",
    "KS 52k": "22c820bc-7b09-488b-a706-061cdb945c16",
    "TX 200k (synthetic)": str(uuid.UUID(int=200_000)),
}
DOCS = {k: uuid.UUID(v) for k, v in DOCS.items()}
KS = [1, 10, 100, 1000, 10000]
WARM_REPS, COLD_REPS = 11, 5
rng = random.Random(0)


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def setup():
    with psycopg.connect(PG + "postgres", autocommit=True) as c:
        c.execute("DROP DATABASE IF EXISTS districtr_bench")
        c.execute("CREATE DATABASE districtr_bench")
    with psycopg.connect(BENCH, autocommit=True) as b, psycopg.connect(SRC) as s:
        b.execute(
            "CREATE TABLE rel (document_id uuid, geo_id varchar, zone int,"
            " PRIMARY KEY (document_id, geo_id)) WITH (autovacuum_enabled = false)"
        )
        with s.cursor().copy(
            "COPY document.assignments (document_id, geo_id, zone) TO STDOUT"
        ) as out, b.cursor().copy("COPY rel FROM STDIN") as cin:
            for chunk in out:
                cin.write(chunk)
        # A whole-state block-level plan: the upper bound on plan size.
        blocks = s.execute(
            "SELECT path FROM gerrydb.tx_districtr_block_view_v2 ORDER BY path LIMIT 200000"
        ).fetchall()
        with b.cursor().copy("COPY rel FROM STDIN") as cin:
            for (p,) in blocks:
                cin.write_row((DOCS["TX 200k (synthetic)"], p, rng.randint(1, 31)))
        for t, comp in (("js", "pglz"), ("js_lz4", "lz4")):
            b.execute(
                f"CREATE TABLE {t} (document_id uuid PRIMARY KEY,"
                f" assignments jsonb COMPRESSION {comp} NOT NULL)"
                " WITH (autovacuum_enabled = false, toast.autovacuum_enabled = false)"
            )
            b.execute(
                f"INSERT INTO {t} SELECT document_id, jsonb_object_agg(geo_id, zone)"
                " FROM rel GROUP BY 1"
            )
        # Storage-only variant: {zone: [geo_ids]} (each zone key stored once).
        b.execute(
            "CREATE TABLE js_byzone (document_id uuid PRIMARY KEY, assignments jsonb)"
        )
        b.execute(
            "INSERT INTO js_byzone SELECT document_id, jsonb_object_agg(z, ids) FROM"
            " (SELECT document_id, coalesce(zone::text, 'null') z, jsonb_agg(geo_id) ids"
            "  FROM rel GROUP BY 1, 2) t GROUP BY 1"
        )
        b.execute("VACUUM ANALYZE")


def storage():
    out = {"tables": {}, "docs": {}}
    with psycopg.connect(BENCH) as b:
        nrows = b.execute("SELECT count(*) FROM rel").fetchone()[0]
        for t in ("rel", "js", "js_lz4", "js_byzone"):
            out["tables"][t] = dict(
                zip(
                    ("total", "heap", "toast", "index"),
                    b.execute(
                        "SELECT pg_total_relation_size(c.oid), pg_relation_size(c.oid),"
                        " coalesce(pg_total_relation_size(nullif(c.reltoastrelid, 0)), 0),"
                        " pg_indexes_size(c.oid) FROM pg_class c WHERE c.oid = %s::regclass",
                        (t,),
                    ).fetchone(),
                )
            )
        out["tables"]["rel_rows"] = nrows
        per_row = out["tables"]["rel"]["total"] / nrows
        for name, doc in DOCS.items():
            n = b.execute(
                "SELECT count(*) FROM rel WHERE document_id = %s", (doc,)
            ).fetchone()[0]
            d = {"rows": n, "rel_est": round(n * per_row)}
            for t in ("js", "js_lz4", "js_byzone"):
                d[t] = b.execute(
                    f"SELECT pg_column_size(assignments), octet_length(assignments::text)"
                    f" FROM {t} WHERE document_id = %s",
                    (doc,),
                ).fetchone()
            out["docs"][name] = d
        # How many docs are small enough to stay inline (not TOASTed)?
        out["js_inline_docs"] = b.execute(
            "SELECT count(*) FILTER (WHERE pg_column_size(assignments) < 2000), count(*) FROM js"
        ).fetchone()
    return out


# --- write strategies --------------------------------------------------------
# Each takes (cursor, doc, full_state, delta) inside an open transaction and
# returns the dirty zones, like PUT /api/assignments does for district_unions.
# The JSON round-trip stands in for the request body the API has to parse.


def rel_full(cur, doc, state, delta):
    body = json.loads(json.dumps([[g, z] for g, z in state.items()]))
    lid = uuid.uuid4().hex[:8]
    cur.execute(f"CREATE TEMP TABLE old_{lid} (geo_id text, zone int) ON COMMIT DROP")
    cur.execute(
        f"INSERT INTO old_{lid} SELECT geo_id, zone FROM rel WHERE document_id = %s",
        (doc,),
    )
    cur.execute("DELETE FROM rel WHERE document_id = %s", (doc,))
    cur.execute(
        f"CREATE TEMP TABLE new_{lid} (document_id uuid, geo_id text, zone int) ON COMMIT DROP"
    )
    with cur.copy(f"COPY new_{lid} FROM STDIN") as cp:
        for g, z in body:
            cp.write_row((doc, g, z))
    cur.execute(f"INSERT INTO rel SELECT document_id, geo_id, zone FROM new_{lid}")
    cur.execute(
        f"""SELECT DISTINCT z FROM (
            SELECT o.zone z FROM old_{lid} o LEFT JOIN rel n
              ON n.document_id = %(d)s AND n.geo_id = o.geo_id
             WHERE n.zone IS DISTINCT FROM o.zone
            UNION
            SELECT n.zone FROM rel n LEFT JOIN old_{lid} o ON o.geo_id = n.geo_id
             WHERE n.document_id = %(d)s AND n.zone IS DISTINCT FROM o.zone
        ) s WHERE z IS NOT NULL""",
        {"d": doc},
    )
    return cur.fetchall()


REL_DELTA = """
WITH d AS (SELECT * FROM unnest(%(g)s::text[], %(z)s::int[]) d(geo_id, zone)),
old AS (SELECT a.geo_id, a.zone FROM rel a JOIN d USING (geo_id) WHERE a.document_id = %(doc)s),
del AS (DELETE FROM rel WHERE document_id = %(doc)s AND geo_id = ANY(%(rm)s::text[]) RETURNING zone),
up AS (
  INSERT INTO rel (document_id, geo_id, zone) SELECT %(doc)s, geo_id, zone FROM d
  ON CONFLICT (document_id, geo_id) DO UPDATE SET zone = excluded.zone
  WHERE rel.zone IS DISTINCT FROM excluded.zone
  RETURNING geo_id, zone)
SELECT DISTINCT z FROM (
  SELECT o.zone z FROM old o JOIN up USING (geo_id)
  UNION ALL SELECT zone FROM up
  UNION ALL SELECT zone FROM del) s WHERE z IS NOT NULL
"""


def rel_delta(cur, doc, state, delta):
    body = json.loads(json.dumps(delta))
    cur.execute(
        REL_DELTA,
        {"doc": doc, "g": [g for g, _ in body], "z": [z for _, z in body], "rm": []},
        prepare=False,  # generic plans nested-loop the CTEs: O(k^2)
    )
    return cur.fetchall()


def js_delta_sql(t):
    # Old values come from one jsonb_each_text pass hash-joined to the delta:
    # `assignments ->> key` per delta row would detoast the blob k times.
    return f"""
WITH d AS (SELECT * FROM unnest(%(g)s::text[], %(z)s::int[]) d(geo_id, zone)),
old AS (
  SELECT d.geo_id, e.value::int zone, d.zone new_zone
  FROM {t} j CROSS JOIN LATERAL jsonb_each_text(j.assignments) e
  JOIN d ON d.geo_id = e.key WHERE j.document_id = %(doc)s),
upd AS (
  UPDATE {t} SET assignments = (assignments - %(rm)s::text[])
    || (SELECT coalesce(jsonb_object_agg(geo_id, zone), '{{}}') FROM d)
  WHERE document_id = %(doc)s RETURNING 1)
SELECT DISTINCT z FROM (
  SELECT zone z FROM old WHERE zone IS DISTINCT FROM new_zone
  UNION ALL SELECT new_zone FROM old WHERE zone IS DISTINCT FROM new_zone) s
WHERE z IS NOT NULL
"""


def js_full_sql(t):
    return f"""
WITH n AS MATERIALIZED (SELECT %(new)s::jsonb j),
cur AS (SELECT e.key, e.value FROM {t} x, jsonb_each_text(x.assignments) e WHERE x.document_id = %(doc)s),
nxt AS (SELECT e.key, e.value FROM n, jsonb_each_text(n.j) e),
upd AS (UPDATE {t} SET assignments = (SELECT j FROM n) WHERE document_id = %(doc)s RETURNING 1),
diff AS (SELECT c.value cv, x.value nv FROM cur c FULL JOIN nxt x USING (key)
         WHERE c.value IS DISTINCT FROM x.value)
SELECT DISTINCT z::int FROM (SELECT cv z FROM diff UNION ALL SELECT nv FROM diff) s
WHERE z IS NOT NULL
"""


def make_js_delta(t):
    sql = js_delta_sql(t)

    def f(cur, doc, state, delta):
        body = json.loads(json.dumps(delta))
        cur.execute(
            sql,
            {
                "doc": doc,
                "g": [g for g, _ in body],
                "z": [z for _, z in body],
                "rm": [],
            },
            prepare=False,  # generic plans nested-loop jsonb_each_text x delta: O(N*k)
        )
        return cur.fetchall()

    return f


def make_js_full(t):
    sql = js_full_sql(t)

    def f(cur, doc, state, delta):
        body = json.loads(json.dumps([[g, z] for g, z in state.items()]))
        cur.execute(sql, {"doc": doc, "new": json.dumps(dict(body))})
        return cur.fetchall()

    return f


STRATEGIES = {
    "rel_full (current)": ("rel", rel_full, True),
    "rel_delta": ("rel", rel_delta, False),
    "js_full": ("js", make_js_full("js"), True),
    "js_delta": ("js", make_js_delta("js"), False),
    "js_lz4_delta": ("js_lz4", make_js_delta("js_lz4"), False),
}


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p * (len(xs) - 1))))]


def writes():
    results = []
    with psycopg.connect(BENCH, autocommit=True) as conn:
        zones, states = {}, {}
        for name, doc in DOCS.items():
            rows = conn.execute(
                "SELECT geo_id, zone FROM rel WHERE document_id = %s", (doc,)
            ).fetchall()
            zones[name] = list(range(1, max(z or 1 for _, z in rows) + 1)) + [None]
            for t in ("rel", "js", "js_lz4"):
                states[(t, name)] = dict(rows)

        def delta_for(state, k, zs):
            keys = rng.sample(list(state), k)
            return [[g, rng.choice([z for z in zs if z != state[g]])] for g in keys]

        for name, doc in DOCS.items():
            n = len(states[("rel", name)])
            for sname, (table, fn, full) in STRATEGIES.items():
                for k in [100] if full else [k for k in KS if k <= n // 2]:
                    conn.execute(
                        f"VACUUM FULL {table}"
                    )  # no free space, so growth = new bloat
                    cell = {"doc": name, "rows": n, "strategy": sname, "k": k}
                    for mode, reps in (("warm", WARM_REPS), ("cold", COLD_REPS)):
                        lat, wal = [], []
                        size0 = conn.execute(
                            "SELECT pg_total_relation_size(%s)", (table,)
                        ).fetchone()[0]
                        for _ in range(reps):
                            state = states[(table, name)]
                            delta = delta_for(state, k, zones[name])
                            state.update(dict(delta))
                            if mode == "cold":
                                conn.execute("CHECKPOINT")
                            lsn0 = conn.execute(
                                "SELECT pg_current_wal_insert_lsn()"
                            ).fetchone()[0]
                            t0 = time.perf_counter()
                            with conn.transaction():
                                fn(conn.cursor(), doc, state, delta)
                            lat.append((time.perf_counter() - t0) * 1000)
                            wal.append(
                                conn.execute(
                                    "SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(), %s)",
                                    (lsn0,),
                                ).fetchone()[0]
                            )
                        cell[mode] = {
                            "ms_p50": round(statistics.median(lat), 2),
                            "ms_p90": round(pct(lat, 0.9), 2),
                            "wal_p50": int(statistics.median(wal)),
                            # No autovacuum on bench tables: on-disk growth = bloat a save leaves.
                            "growth_per_save": int(
                                (
                                    conn.execute(
                                        "SELECT pg_total_relation_size(%s)", (table,)
                                    ).fetchone()[0]
                                    - size0
                                )
                                / reps
                            ),
                        }
                    log(sname, name, k, cell["warm"], cell["cold"])
                    results.append(cell)
        # Every strategy must leave the same plan behind.
        for name, doc in DOCS.items():
            rel = dict(
                conn.execute(
                    "SELECT geo_id, zone FROM rel WHERE document_id = %s", (doc,)
                ).fetchall()
            )
            for t in ("js", "js_lz4"):
                j = conn.execute(
                    f"SELECT assignments FROM {t} WHERE document_id = %s", (doc,)
                ).fetchone()[0]
                assert j == states[(t, name)], (t, name)
            assert rel == states[("rel", name)], name
    return results


def reads():
    """Whole-plan reads into Python: get_assignments (display) and the
    evaluation context both load every (geo_id, zone)."""
    out = []
    queries = {
        "rel rows": ("SELECT geo_id, zone FROM rel WHERE document_id = %s", None),
        "js blob -> dict": (
            "SELECT assignments FROM js WHERE document_id = %s",
            "blob",
        ),
        "js_lz4 blob -> dict": (
            "SELECT assignments FROM js_lz4 WHERE document_id = %s",
            "blob",
        ),
        "js jsonb_each_text rows": (
            "SELECT e.key, e.value::int FROM js, jsonb_each_text(assignments) e WHERE document_id = %s",
            None,
        ),
        "rel distinct zones": (
            "SELECT DISTINCT zone FROM rel WHERE document_id = %s AND zone IS NOT NULL",
            None,
        ),
        "js distinct zones": (
            "SELECT DISTINCT value FROM js, jsonb_each(assignments) WHERE document_id = %s"
            " AND value <> 'null'",
            None,
        ),
    }
    with psycopg.connect(BENCH, autocommit=True) as conn:
        for name, doc in DOCS.items():
            for q, (sql, kind) in queries.items():
                lat = []
                for _ in range(15):
                    t0 = time.perf_counter()
                    rows = conn.execute(sql, (doc,)).fetchall()
                    if kind == "blob":
                        rows = list(rows[0][0].items())
                    lat.append((time.perf_counter() - t0) * 1000)
                out.append(
                    {
                        "doc": name,
                        "query": q,
                        "ms_p50": round(statistics.median(lat), 2),
                    }
                )
                log("read", name, q, out[-1]["ms_p50"])
    return out


if __name__ == "__main__":
    setup()
    log("setup done")
    res = {"storage": storage()}
    log(json.dumps(res["storage"], indent=1))
    res["reads"] = reads()
    res["writes"] = writes()
    print(json.dumps(res, indent=1))
