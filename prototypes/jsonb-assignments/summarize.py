"""writes.json + joins.json -> markdown tables. python3 summarize.py writes.json joins.json"""

import json
import sys

w = json.load(open(sys.argv[1]))
j = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else []


def kb(b):
    return f"{b / 1024:,.0f} KB" if b < 1024**2 else f"{b / 1024**2:,.1f} MB"


st = w["storage"]
print("### Storage (all 646 local plans + one synthetic 200k plan)\n")
print("| format | total | heap | toast | index |\n|---|---|---|---|---|")
for t in ("rel", "js", "js_lz4", "js_byzone"):
    s = st["tables"][t]
    print(
        f"| {t} | {kb(s['total'])} | {kb(s['heap'])} | {kb(s['toast'])} | {kb(s['index'])} |"
    )
print(
    f"\n{st['js_inline_docs'][0]} of {st['js_inline_docs'][1]} jsonb plans are small enough to stay inline (<2 KB).\n"
)
print(
    "| plan | rows | relational (est.) | jsonb pglz | jsonb lz4 | {zone:[ids]} pglz | raw JSON text |\n|---|---|---|---|---|---|---|"
)
for name, d in st["docs"].items():
    print(
        f"| {name} | {d['rows']:,} | {kb(d['rel_est'])} | {kb(d['js'][0])} | {kb(d['js_lz4'][0])} | {kb(d['js_byzone'][0])} | {kb(d['js'][1])} |"
    )

print("\n### Whole-plan reads into Python (ms, p50)\n")
docs = list(dict.fromkeys(r["doc"] for r in w["reads"]))
qs = list(dict.fromkeys(r["query"] for r in w["reads"]))
print("| query | " + " | ".join(docs) + " |\n|---|" + "---|" * len(docs))
for q in qs:
    vals = {r["doc"]: r["ms_p50"] for r in w["reads"] if r["query"] == q}
    print(f"| {q} | " + " | ".join(f"{vals[d]}" for d in docs) + " |")

for metric, label, fmt in (
    ("ms_p50", "Save latency, ms p50 (warm)", lambda v: f"{v:g}"),
    ("wal_p50", "WAL bytes per save, p50 (warm)", kb),
    ("growth_per_save", "On-disk growth per save before vacuum (warm)", kb),
):
    print(f"\n### {label}\n")
    for mode in ("warm",) if metric != "wal_p50" else ("warm", "cold"):
        if mode == "cold":
            print(
                "\nAfter a CHECKPOINT (first touch of each page pays a full-page image) — the realistic case for a plan saved every few seconds/minutes:\n"
            )
        strategies = list(dict.fromkeys(r["strategy"] for r in w["writes"]))
        print(
            "| plan | k changed | "
            + " | ".join(strategies)
            + " |\n|---|---|"
            + "---|" * len(strategies)
        )
        docs = list(dict.fromkeys(r["doc"] for r in w["writes"]))
        for d in docs:
            ks = sorted({r["k"] for r in w["writes"] if r["doc"] == d})
            for k in ks:
                cells = []
                for s in strategies:
                    r = next(
                        (
                            r
                            for r in w["writes"]
                            if r["doc"] == d and r["strategy"] == s and r["k"] == k
                        ),
                        None,
                    )
                    if r is None and s.endswith("full") or (r is None and "full" in s):
                        r = next(
                            (
                                r
                                for r in w["writes"]
                                if r["doc"] == d and r["strategy"] == s
                            ),
                            None,
                        )
                        cells.append(f"({fmt(r[mode][metric])})" if r else "")
                    else:
                        cells.append(fmt(r[mode][metric]) if r else "")
                print(f"| {d} | {k:,} | " + " | ".join(cells) + " |")

if j:
    print(
        "\n### Geometry joins (ms, p50) — relational table vs jsonb_each_text expansion\n"
    )
    print(
        "| plan | source | join all units | bbox one zone | union one zone | join plan |\n|---|---|---|---|---|---|"
    )
    for r in j:
        print(
            f"| {r['doc']} | {r['src']} | {r['join_all_ms']} | {r['bbox_zone_ms']} | {r['union_zone_ms']} | {'; '.join(r['joins'][:2])} |"
        )
