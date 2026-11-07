"""Expand real plans to block-level vectors in GEOID order (BEN's node-order contract).
docker exec -i backend python - < export_vectors.py > vectors.jsonl"""

import json
import sys
import psycopg

sys.path.insert(0, "/districtr-backend")
from app.evaluation.graph_loader import get_graph

DOCS = {
    "CO 8k": ("3d8f5033-9088-4d12-94df-620d97fc7012", "co_districtr_view_v2"),
    "TX 23k": ("d618e585-7aa9-4c6d-9e40-658efc3b3698", "tx_districtr_view_v2"),
    "KS 52k": ("22c820bc-7b09-488b-a706-061cdb945c16", "ks_districtr_view_v2"),
}
with psycopg.connect(
    "host=db dbname=districtr user=postgres password=postgres"
) as conn:
    for name, (doc, table) in DOCS.items():
        G = get_graph(table)
        nodes = [str(n) for n in G._node_ids]
        parents = G.parents_of(nodes)
        parent_of = {n: p for n, p in zip(nodes, parents) if p is not None}
        blocks = sorted(parent_of)  # GEOID order keeps a VTD's blocks mostly adjacent
        asg = dict(
            conn.execute(
                "SELECT geo_id, zone FROM document.assignments WHERE document_id = %s",
                (doc,),
            ).fetchall()
        )
        vec = [
            (asg[b] if b in asg else asg.get(parent_of[b])) or 0 for b in blocks
        ]  # 0 = unassigned
        print(
            json.dumps(
                {
                    "name": name,
                    "rows": len(asg),
                    "blocks": len(blocks),
                    "assignment": vec,
                }
            )
        )
        print(name, len(asg), "rows ->", len(blocks), "blocks", file=sys.stderr)
