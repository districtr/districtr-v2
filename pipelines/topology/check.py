"""Verify topology parquets written by build.py against the source GeoPackages.

    python pipelines/topology/check.py OUT_DIR PARENT_GPKG CHILD_GPKG [--county 48453]
        [--tabular tx_districtr_view_v2.parquet] [--simplified]

OUT_DIR is one variant directory (.../full/NAME). With --simplified, geometry is checked
for validity and area drift instead of exact equality. Exits non-zero if a check fails.
"""

import argparse
import os
import sqlite3
import sys

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.parquet as pq
import pyogrio
import shapely

from build import SCALE, offsets

FAILED = []


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'} {name} {detail}")
    if not ok:
        FAILED.append(name)


def flat(col):
    """list<int32> column -> (values, offsets)."""
    arr = col.combine_chunks()
    return arr.values.to_numpy(), arr.offsets.to_numpy().astype(np.int64)


def decode_arcs(t):
    xs, off = flat(t["xs"])
    ys, _ = flat(t["ys"])
    xy = np.stack([xs, ys], 1).astype(np.int64)
    arc = np.repeat(np.arange(len(off) - 1), np.diff(off))
    xy = np.cumsum(xy, 0)
    start = xy[off[:-1] - 1] if len(off) > 1 else xy[:0]
    base = np.where((off[:-1] > 0)[:, None], start, 0)
    return xy - base[arc], off


def decode_blob(t):
    col = t["xy"].combine_chunks()
    _, ob, db = col.buffers()
    boff = np.frombuffer(ob, np.int32, len(col) + 1, col.offset * 4).astype(np.int64)
    d = np.frombuffer(db, "<i4", (boff[-1] - boff[0]) // 4, boff[0]).reshape(-1, 2)
    boff -= boff[0]
    off = boff // 8
    xy = np.cumsum(d.astype(np.int64), 0)
    base = np.where((off[:-1] > 0)[:, None], xy[np.maximum(off[:-1] - 1, 0)], 0)
    return xy - base[np.repeat(np.arange(len(off) - 1), np.diff(off))], off


def unit_refs(t):
    """rings list<list<int32>> -> (refs, ring_off, unit_ring_off)."""
    arr = t["rings"].combine_chunks()
    inner = arr.values
    return (
        inner.values.to_numpy().astype(np.int64),
        inner.offsets.to_numpy().astype(np.int64),
        arr.offsets.to_numpy().astype(np.int64),
    )


def rebuild(refs, ring_off, unit_ring_off, xy, off):
    """Assemble rings from arc refs; returns (MultiPolygon array, ring vertex counts)."""
    arc = np.where(refs >= 0, refs, ~refs)
    rev = refs < 0
    n = np.diff(off)[arc]
    first_in_ring = np.zeros(len(refs), bool)
    first_in_ring[ring_off[:-1]] = True
    start_v = np.where(rev, off[arc + 1] - 1, off[arc])
    end_v = np.where(rev, off[arc], off[arc + 1] - 1)
    prev_end = np.roll(end_v, 1)
    ring_of_ref = np.repeat(np.arange(len(ring_off) - 1), np.diff(ring_off))
    prev_end[first_in_ring] = end_v[ring_off[1:] - 1]  # closure: last arc -> first arc
    joined = (xy[start_v] == xy[prev_end]).all(1)
    skip = (~first_in_ring).astype(np.int64)
    count = n - skip
    begin = np.where(rev, start_v - skip, start_v + skip)
    step = np.where(rev, -1, 1)
    local = np.arange(count.sum()) - np.repeat(offsets(count)[:-1], count)
    coords = xy[np.repeat(begin, count) + np.repeat(step, count) * local]
    r_off = offsets(
        np.bincount(ring_of_ref, weights=count, minlength=len(ring_off) - 1).astype(
            np.int64
        )
    )
    ring_id = np.repeat(np.arange(len(r_off) - 1), np.diff(r_off))
    rel = (coords - coords[r_off[:-1]][ring_id]).astype(np.float64)
    cross = rel[:-1, 0] * rel[1:, 1] - rel[1:, 0] * rel[:-1, 1]
    cross[ring_id[:-1] != ring_id[1:]] = 0
    ccw = np.bincount(ring_id[:-1], weights=cross, minlength=len(r_off) - 1) > 0
    poly_start = np.flatnonzero(ccw)
    unit_of_ring = np.repeat(np.arange(len(unit_ring_off) - 1), np.diff(unit_ring_off))
    starts_ok = ccw[unit_ring_off[:-1]].all()
    geoms = shapely.from_ragged_array(
        shapely.GeometryType.MULTIPOLYGON,
        coords.astype(np.float64),
        (
            r_off,
            np.append(poly_start, len(r_off) - 1),
            offsets(
                np.bincount(unit_of_ring[poly_start], minlength=len(unit_ring_off) - 1)
            ),
        ),
    )
    return geoms, joined.all() and starts_ok, np.diff(r_off)


def quantized_multi(geoms):
    parts, idx = shapely.get_parts(geoms, return_index=True)
    multi = shapely.multipolygons(parts, indices=idx)
    return shapely.transform(multi, lambda c: np.rint(c * SCALE))


def read_src(gpkg, where):
    layer = os.path.splitext(os.path.basename(gpkg))[0]
    gdf = pyogrio.read_dataframe(gpkg, layer=layer, where=where, use_arrow=True)
    return gdf.set_index("path")


def graph_pairs(gpkg, index):
    with sqlite3.connect(gpkg) as con:
        e = np.array(
            con.execute("SELECT path_1, path_2 FROM gerrydb_graph_edge").fetchall(),
            dtype=object,
        )
    i, j = index.get_indexer(e[:, 0]), index.get_indexer(e[:, 1])
    keep = (i >= 0) & (j >= 0)  # subset builds: edges inside the subset only
    return np.unique(np.minimum(i, j)[keep] * len(index) + np.maximum(i, j)[keep])


def side_pairs(a, b, n):
    keep = (a >= 0) & (b >= 0)
    return np.unique(
        np.minimum(a, b)[keep].astype(np.int64) * n + np.maximum(a, b)[keep]
    )


def refs_once(name, refs, ring_off, unit_ring_off, a, b, n_arcs):
    owner = np.repeat(np.arange(len(unit_ring_off) - 1), np.diff(unit_ring_off))
    owner = np.repeat(owner, np.diff(ring_off))
    arc = np.where(refs >= 0, refs, ~refs)
    fwd = refs >= 0
    check(f"{name}: refs in range", arc.max() < n_arcs)
    nf = np.bincount(arc[fwd], minlength=n_arcs)
    nr = np.bincount(arc[~fwd], minlength=n_arcs)
    of = np.full(n_arcs, -1)
    of[arc[fwd]] = owner[fwd]
    orr = np.full(n_arcs, -1)
    orr[arc[~fwd]] = owner[~fwd]
    ok = (
        (nf == (a >= 0)).all()
        and (nr == (b >= 0)).all()
        and (of == a).all()
        and (orr == b).all()
    )
    bad = int(((nf != (a >= 0)) | (nr != (b >= 0)) | (of != a) | (orr != b)).sum())
    check(
        f"{name}: each arc used once forward by a, once reversed by b",
        ok,
        f"({bad} bad arcs)",
    )


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("out_dir")
    ap.add_argument("parent_gpkg")
    ap.add_argument("child_gpkg")
    ap.add_argument("--county")
    ap.add_argument("--tabular")
    ap.add_argument("--simplified", action="store_true")
    args = ap.parse_args()
    rd = lambda f: pq.read_table(os.path.join(args.out_dir, f"{f}.parquet"))  # noqa: E731
    parents, children = rd("parents"), rd("children")
    ext, inn, blob = rd("arcs_exterior"), rd("arcs_interior"), rd("arcs_exterior_blob")
    P, C, E, NI = len(parents), len(children), len(ext), len(inn)
    print(f"parents {P}, children {C}, exterior arcs {E}, interior arcs {NI}")

    exy, eoff = decode_arcs(ext)
    ixy, ioff = decode_arcs(inn)
    bxy, boff = decode_blob(blob)
    check("blob == xs/ys", np.array_equal(bxy, exy) and np.array_equal(boff, eoff))
    for c in ["a_parent", "b_parent", "a_child", "b_child", "length_m"]:
        assert ext[c].equals(blob[c])
    xy = np.concatenate([exy, ixy])
    off = np.concatenate([eoff, eoff[-1] + ioff[1:]])
    print(f"arc vertices: exterior {len(exy)}, interior {len(ixy)}, total {len(xy)}")
    lo = np.minimum.reduceat(xy, off[:-1])
    hi = np.maximum.reduceat(xy, off[:-1])
    box = np.concatenate(
        [
            np.stack([t[c].to_numpy() for c in ["xmin", "ymin", "xmax", "ymax"]], 1)
            for t in (ext, inn)
        ]
    )
    check("arc bbox matches coords", np.array_equal(np.concatenate([lo, hi], 1), box))

    # row ranges
    cp = children["parent_idx"].to_numpy()
    ip = inn["parent_idx"].to_numpy()
    g = lambda c: parents[c].to_numpy().astype(np.int64)  # noqa: E731
    check("children grouped by parent", (np.diff(cp) >= 0).all())
    check(
        "child_row_start/count",
        np.array_equal(
            offsets(g("child_row_count")), np.append(g("child_row_start"), C)
        )
        and np.array_equal(np.bincount(cp, minlength=P), g("child_row_count")),
    )
    check(
        "interior_row_start/count",
        (np.diff(ip) >= 0).all()
        and np.array_equal(
            offsets(g("interior_row_count")), np.append(g("interior_row_start"), NI)
        )
        and np.array_equal(np.bincount(ip, minlength=P), g("interior_row_count")),
    )
    ea_c, eb_c = ext["a_child"].to_numpy(), ext["b_child"].to_numpy()
    ea_p, eb_p = ext["a_parent"].to_numpy(), ext["b_parent"].to_numpy()
    ia, ib = inn["a_child"].to_numpy(), inn["b_child"].to_numpy()
    check("a side never outside", (ea_c >= 0).all() and (ia >= 0).all())
    check(
        "exterior arc parents match children",
        np.array_equal(ea_p, cp[ea_c])
        and np.array_equal(eb_p, np.where(eb_c >= 0, cp[np.maximum(eb_c, 0)], -1))
        and (ea_p != eb_p).all(),
    )
    check(
        "interior arcs inside one parent",
        (ib >= 0).all() and np.array_equal(cp[ia], ip) and np.array_equal(cp[ib], ip),
    )

    c_refs, c_roff, c_uoff = unit_refs(children)
    p_refs, p_roff, p_uoff = unit_refs(parents)
    refs_once(
        "children",
        c_refs,
        c_roff,
        c_uoff,
        np.concatenate([ea_c, ia]),
        np.concatenate([eb_c, ib]),
        E + NI,
    )
    refs_once("parents", p_refs, p_roff, p_uoff, ea_p, eb_p, E)

    # geometry
    p_where = f"path LIKE 'vtd:{args.county}%'" if args.county else None
    c_where = f"path LIKE '{args.county}%'" if args.county else None
    psrc = read_src(args.parent_gpkg, p_where)
    csrc = read_src(args.child_gpkg, c_where)
    p_paths, c_paths = (
        parents["path"].to_numpy(zero_copy_only=False),
        children["path"].to_numpy(zero_copy_only=False),
    )
    check(
        "unit sets match source",
        len(psrc) == P
        and len(csrc) == C
        and psrc.index.get_indexer(p_paths).min() >= 0
        and csrc.index.get_indexer(c_paths).min() >= 0,
    )
    psrc, csrc = psrc.loc[p_paths], csrc.loc[c_paths]
    for name, refs, roff, uoff, src in [
        ("children", c_refs, c_roff, c_uoff, csrc),
        ("parents", p_refs, p_roff, p_uoff, psrc),
    ]:
        geoms, joined, ring_nv = rebuild(refs, roff, uoff, xy, off)
        check(f"{name}: arcs chain into closed rings, first ring CCW", joined)
        check(
            f"{name}: rings have >= 4 vertices",
            ring_nv.min() >= 4,
            f"(min {ring_nv.min()})",
        )
        src_q = quantized_multi(src.geometry.to_numpy())
        if not args.simplified:
            eq = shapely.equals_exact(
                shapely.normalize(geoms), shapely.normalize(src_q), tolerance=0
            )
            if (
                not eq.all()
            ):  # repeated source vertices etc.: fall back to topological equality
                eq[~eq] = shapely.equals(geoms[~eq], src_q[~eq])
            check(
                f"{name}: rebuilt == source geometry (all {len(geoms)})",
                eq.all(),
                f"({(~eq).sum()} differ)",
            )
        else:
            valid = shapely.is_valid(geoms)
            a0, a1 = shapely.area(src_q), shapely.area(geoms)
            rel = np.abs(a1 - a0) / a0
            print(
                f"  {name}: {(~valid).sum()} invalid of {len(geoms)}; planar area rel. error median {np.median(rel):.2e}, p99 {np.quantile(rel, 0.99):.2e}, max {rel.max():.2e}"
            )
        lab = shapely.points(
            np.stack(
                [
                    g(c) if name == "parents" else children[c].to_numpy()
                    for c in ["label_x", "label_y"]
                ],
                1,
            ).astype(np.float64)
        )
        if not args.simplified:
            check(
                f"{name}: labels inside unit",
                shapely.contains_properly(src_q, lab).mean() > 0.999,
                f"({(~shapely.contains_properly(src_q, lab)).sum()} on edge/outside)",
            )

    # adjacency vs gerrydb_graph_edge
    check(
        "block adjacency == gerrydb_graph_edge",
        np.array_equal(
            side_pairs(np.concatenate([ea_c, ia]), np.concatenate([eb_c, ib]), C),
            graph_pairs(args.child_gpkg, csrc.index),
        ),
    )
    check(
        "VTD adjacency == gerrydb_graph_edge",
        np.array_equal(
            side_pairs(ea_p, eb_p, P), graph_pairs(args.parent_gpkg, psrc.index)
        ),
    )

    # areas and demography sums
    rel = (
        np.abs(
            np.bincount(cp, weights=children["area_m2"].to_numpy(), minlength=P)
            - parents["area_m2"].to_numpy()
        )
        / parents["area_m2"].to_numpy()
    )
    check(
        "sum(children area_m2) == parent area_m2",
        rel.max() < 1e-9,
        f"(max rel {rel.max():.1e})",
    )
    demog = [c for c in children.column_names if c in psrc.columns]
    mism = {
        c: int(
            (
                np.bincount(cp, weights=children[c].to_numpy(), minlength=P)
                != parents[c].to_numpy()
            ).sum()
        )
        for c in demog
    }
    check("sum(children total_pop_20) == parent", mism["total_pop_20"] == 0)
    print(
        f"  demography columns with parent != sum(children): {({k: v for k, v in mism.items() if v}) or 'none'}"
    )
    check(
        "demography == source gpkg",
        all(
            (children[c].to_numpy() == csrc[c].to_numpy()).all()
            and (parents[c].to_numpy() == psrc[c].to_numpy()).all()
            for c in demog
        ),
    )

    if args.tabular:
        rng = np.random.default_rng(0)
        sample = np.concatenate(
            [
                rng.choice(p_paths, min(50, P), replace=False),
                rng.choice(c_paths, min(300, C), replace=False),
            ]
        )
        long = (
            ds.dataset(args.tabular)
            .to_table(filter=pc.field("path").isin(pa.array(sample)))
            .to_pandas()
        )
        wide = long[long.column_name != "index_right"].pivot(
            index="path", columns="column_name", values="value"
        )
        cols = sorted(set(wide.columns))
        check(
            "demography columns == tabular column_name set minus index_right",
            cols == sorted(demog),
        )
        mine = (
            pa.concat_tables(
                [parents.select(["path", *demog]), children.select(["path", *demog])]
            )
            .to_pandas()
            .set_index("path")
            .loc[wide.index, cols]
        )
        check(
            f"demography spot-check vs tabular ({len(wide)} units)",
            np.array_equal(mine.to_numpy(np.float64), wide.to_numpy(np.float64)),
        )
        par = long.drop_duplicates("path").set_index("path")["parent_path"]
        cs = par[par != "__parent"]
        mine_par = p_paths[cp[csrc.index.get_indexer(cs.index)]]
        check(
            "crosswalk spot-check vs tabular parent_path",
            np.array_equal(mine_par, cs.to_numpy().astype(str)),
            f"({len(cs)} children)",
        )

    for f in [
        "parents",
        "children",
        "arcs_exterior",
        "arcs_exterior_blob",
        "arcs_interior",
    ]:
        md = pq.ParquetFile(os.path.join(args.out_dir, f"{f}.parquet")).metadata
        print(
            f"  {f}: {os.path.getsize(os.path.join(args.out_dir, f + '.parquet')):,} B, {md.num_rows} rows, {md.num_row_groups} RGs, footer {md.serialized_size:,} B"
        )
    print("ALL PASS" if not FAILED else f"FAILED: {FAILED}")
    sys.exit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
