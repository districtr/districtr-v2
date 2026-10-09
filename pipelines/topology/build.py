"""Build client-side topology parquets (contract: prototypes/topology-parquet/README.md).

Exact-grid topology. Every coordinate sits on the 1e-6 degree grid and both layers are valid
coverages, so a block edge shared by two blocks is the same integer segment on both sides.
Segments are deduplicated, nodes are vertices of degree >= 3 (plus one forced node on rings
that have none), each ring is cut at nodes into runs, and identical runs become one arc.
Parent (VTD) rings are expressed with the same arcs by looking up their segments.

    python pipelines/topology/build.py PARENT_GPKG CHILD_GPKG OUT_ROOT NAME [--county 48453]

writes OUT_ROOT/{full,simplified}/NAME/{parents,children,arcs_exterior,arcs_exterior_blob,
arcs_interior}.parquet.
"""

import argparse
import logging
import os
import shutil
import time

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pyogrio
import shapely
from pyproj import Geod

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

SCALE = 1_000_000  # int32 lon/lat at 1e-6 degrees
GEOD = Geod(ellps="WGS84")
SIMPLIFY_TOLERANCE = 20  # grid units = 2e-5 degrees, about one z12 tile unit
# children / arcs_interior row groups hold whole parents, about this many rows each. The
# client range-reads a few hundred shattered parents and hyparquet reads whole column chunks,
# so smaller RGs cut over-read but grow the footer (~2.8 KB/RG children, ~0.5 KB/RG
# interior). 1,000 rows minimises footer + over-read for 167 clustered parents on TX.
ROW_GROUP_ROWS = 1_000
PARQUET_OPTS = dict(
    compression="zstd",
    compression_level=12,
    write_statistics=False,  # the client locates rows via *_row_start, not stats
    use_dictionary=False,
)


def ranges(starts, lens):
    """Concatenation of arange(s, s + n) for each (s, n)."""
    lens = np.asarray(lens, np.int64)
    ends = np.cumsum(lens)
    out = np.arange(ends[-1] if len(ends) else 0, dtype=np.int64)
    out += np.repeat(np.asarray(starts, np.int64) - (ends - lens), lens)
    return out


def offsets(lens):
    return np.concatenate([[0], np.cumsum(lens)]).astype(np.int64)


def hilbert(x, y, order=16):
    n = 1 << order
    x = (x - x.min()) * (n - 1) // max(np.ptp(x), 1)
    y = (y - y.min()) * (n - 1) // max(np.ptp(y), 1)
    d = np.zeros(len(x), np.int64)
    s = n >> 1
    while s:
        rx, ry = (x & s) > 0, (y & s) > 0
        d += s * s * ((3 * rx) ^ ry)
        flip = rx & ~ry
        x, y = np.where(flip, n - 1 - x, x), np.where(flip, n - 1 - y, y)
        x, y = np.where(ry, x, y), np.where(ry, y, x)
        s >>= 1
    return d


def read_units(gpkg, where):
    layer = os.path.splitext(os.path.basename(gpkg))[0]
    gdf = pyogrio.read_dataframe(gpkg, layer=layer, where=where, use_arrow=True)
    logger.info(f"Read {layer} :: {len(gdf)} rows")
    paths = gdf["path"].to_numpy(dtype=object)
    demog = gdf.drop(columns=["path", "geometry"])
    return paths, demog, gdf.geometry.to_numpy()


def rings(geoms):
    """Quantized rings, deduped and oriented (outer CCW, holes CW in lon/lat).

    Returns (xy int64 (V, 2) closed rings, ring_off (R+1), unit_ring_off (U+1)).
    """
    gtype, coords, offs = shapely.to_ragged_array(geoms)
    if gtype == shapely.GeometryType.POLYGON:
        ring_off, poly_off = offs
        geom_off = np.arange(len(geoms) + 1)
    else:
        assert gtype == shapely.GeometryType.MULTIPOLYGON, gtype
        ring_off, poly_off, geom_off = offs
    unit_ring_off = poly_off[geom_off].astype(np.int64)
    nr = len(ring_off) - 1
    outer = np.zeros(nr, bool)
    outer[poly_off[:-1]] = True
    scaled = coords * SCALE
    xy = np.rint(scaled).astype(np.int64)
    assert np.abs(scaled - xy).max() < 1e-3, "coordinates are not on the 1e-6 grid"
    ring_id = np.repeat(np.arange(nr), np.diff(ring_off))
    dup = np.zeros(len(xy), bool)
    dup[1:] = (xy[1:] == xy[:-1]).all(1) & (ring_id[1:] == ring_id[:-1])
    if dup.any():
        logger.info(f"Dropping {dup.sum()} repeated vertices")
        xy, ring_id = xy[~dup], ring_id[~dup]
    ring_off = offsets(np.bincount(ring_id, minlength=nr))
    rel = (xy - xy[ring_off[:-1]][ring_id]).astype(np.float64)
    cross = rel[:-1, 0] * rel[1:, 1] - rel[1:, 0] * rel[:-1, 1]
    cross[ring_id[:-1] != ring_id[1:]] = 0
    area2 = np.bincount(ring_id[:-1], weights=cross, minlength=nr)
    assert (area2 != 0).all(), "zero-area ring"
    flip = (area2 > 0) != outer
    idx = np.arange(len(xy))
    f = flip[ring_id]
    idx[f] = (ring_off[ring_id] + ring_off[ring_id + 1] - 1 - idx)[f]
    return xy[idx], ring_off, unit_ring_off


def segments(vid, ring_off):
    """Directed ring segments (start, end vertex ids) and per-ring segment offsets."""
    last = np.zeros(len(vid), bool)
    last[ring_off[1:] - 1] = True
    pos = np.flatnonzero(~last)
    return vid[pos], vid[pos + 1], ring_off - np.arange(len(ring_off))


def runs(sa, seg_off, node):
    """Rotate each ring to start at a node; return (permutation, run start positions)."""
    n = np.diff(seg_off)
    ring = np.repeat(np.arange(len(n)), n)
    local = np.arange(len(sa)) - seg_off[ring]
    isnode = node[sa]
    first = np.minimum.reduceat(np.where(isnode, local, n.max()), seg_off[:-1])
    assert (first < n).all(), "ring without a node"
    new = seg_off[ring] + (local - first[ring]) % n[ring]
    order = np.empty_like(new)
    order[new] = np.arange(len(new))
    return order, np.flatnonzero(isnode[order])


def build_arcs(sa, sb, seg_off, ring_unit, nv):
    """Arcs from child rings. Every segment is used once per side (twice inside, once on
    the outline); maximal node-to-node runs of segments are arcs."""
    lo, hi = np.minimum(sa, sb), np.maximum(sa, sb)
    fwd = sa < sb
    skeys, sid = np.unique(lo * nv + hi, return_inverse=True)
    cnt = np.bincount(sid)
    assert cnt.max() <= 2, "segment used by more than two rings"
    nfwd = np.bincount(sid, weights=fwd)
    assert (
        (cnt == 1) | (nfwd == 1)
    ).all(), "shared segment used twice in one direction"
    deg = np.bincount(skeys // nv, minlength=nv) + np.bincount(skeys % nv, minlength=nv)
    node = deg >= 3
    has_node = np.logical_or.reduceat(node[sa], seg_off[:-1])
    node[np.minimum.reduceat(sa, seg_off[:-1])[~has_node]] = True  # node-less cycles
    logger.info(
        f"{len(skeys)} unique segments, {node.sum()} nodes ({(~has_node).sum()} forced)"
    )

    order, rs = runs(sa, seg_off, node)
    sa, sb, sid, fwd = sa[order], sb[order], sid[order], fwd[order]
    seg_ring = np.repeat(np.arange(len(seg_off) - 1), np.diff(seg_off))[order]
    run_len = np.diff(np.append(rs, len(sa)))
    run_id = np.repeat(np.arange(len(rs)), run_len)
    run_min = np.minimum.reduceat(sid, rs)
    _, rep, arc_of_run = np.unique(run_min, return_index=True, return_inverse=True)
    at_min = sid == run_min[run_id]
    run_fwd = np.empty(len(rs), bool)
    run_fwd[run_id[at_min]] = fwd[at_min]
    # an arc runs forward the way its first run (lowest ring) traverses it
    rev = run_fwd != run_fwd[rep][arc_of_run]
    na = len(rep)
    assert (np.bincount(arc_of_run) - np.bincount(arc_of_run, weights=rev) == 1).all()
    seg_arc = np.empty(len(skeys), np.int64)
    seg_arc[sid] = arc_of_run[run_id]
    assert (seg_arc[sid] == arc_of_run[run_id]).all()
    seg_arc_fwd = np.empty(len(skeys), bool)
    seg_arc_fwd[sid] = fwd ^ rev[run_id]

    arc_nseg = run_len[rep]
    p = ranges(rs[rep], arc_nseg + 1)
    arc_vid = sa[np.minimum(p, len(sa) - 1)]
    arc_off = offsets(arc_nseg + 1)
    arc_vid[arc_off[1:] - 1] = sb[rs[rep] + arc_nseg - 1]

    run_unit = ring_unit[seg_ring[rs]]
    arc_a = run_unit[rep]
    arc_b = np.full(na, -1, np.int64)
    arc_b[arc_of_run[rev]] = run_unit[rev]
    refs = np.where(rev, ~arc_of_run, arc_of_run)
    ref_off = offsets(np.bincount(seg_ring[rs], minlength=len(seg_off) - 1))
    lookup = dict(
        skeys=skeys, nv=nv, node=node, seg_arc=seg_arc, seg_arc_fwd=seg_arc_fwd
    )
    return arc_vid, arc_off, arc_a, arc_b, refs, ref_off, lookup


def ring_refs(sa, sb, seg_off, lookup):
    """Express other rings (parents) as refs to existing arcs; every run must be a whole arc."""
    nv, skeys = lookup["nv"], lookup["skeys"]
    key = np.minimum(sa, sb) * nv + np.maximum(sa, sb)
    sid = np.searchsorted(skeys, key)
    assert (skeys[np.minimum(sid, len(skeys) - 1)] == key).all(), "segment not in arcs"
    fwd = sa < sb
    order, rs = runs(sa, seg_off, lookup["node"])
    sid, fwd = sid[order], fwd[order]
    seg_ring = np.repeat(np.arange(len(seg_off) - 1), np.diff(seg_off))[order]
    run_len = np.diff(np.append(rs, len(sid)))
    run_id = np.repeat(np.arange(len(rs)), run_len)
    arc = lookup["seg_arc"][sid[rs]]
    rev = fwd[rs] != lookup["seg_arc_fwd"][sid[rs]]
    assert (lookup["seg_arc"][sid] == arc[run_id]).all(), "run spans arcs"
    assert ((fwd != lookup["seg_arc_fwd"][sid]) == rev[run_id]).all()
    return np.where(rev, ~arc, arc), run_len, offsets(np.bincount(seg_ring[rs]))


def ring_geodesic_area(xy, ring_off):
    # ponytail: one pyproj call per ring (~700k for TX, ~10 s); vectorise if it matters.
    lon, lat = xy[:, 0] / SCALE, xy[:, 1] / SCALE
    bounds = zip(ring_off[:-1].tolist(), ring_off[1:].tolist())
    return np.fromiter(
        (GEOD.polygon_area_perimeter(lon[s:e], lat[s:e])[0] for s, e in bounds),
        np.float64,
        count=len(ring_off) - 1,
    )


def arc_lengths(xy, off):
    lon, lat = xy[:, 0] / SCALE, xy[:, 1] / SCALE
    _, _, d = GEOD.inv(lon[:-1], lat[:-1], lon[1:], lat[1:])
    arc = np.repeat(np.arange(len(off) - 1), np.diff(off))[:-1]
    keep = np.ones(len(d), bool)
    keep[off[1:-1] - 1] = False
    return np.bincount(arc[keep], weights=d[keep], minlength=len(off) - 1)


def simplify(xy, off, tol, ring_arcs, ring_off):
    """Douglas-Peucker each arc with endpoints fixed. Arcs of rings that would drop below
    4 vertices (closed ring) keep full resolution."""
    # ponytail: arcs are simplified independently, so neighbouring arcs can cross (33 of
    # 668,757 TX blocks are invalid at 2e-5). Fine for drawing; needs a topology-aware
    # simplifier if the client ever does point-in-polygon on simplified rings.
    lines = shapely.from_ragged_array(
        shapely.GeometryType.LINESTRING, xy.astype(np.float64), (off,)
    )
    _, sxy, (soff,) = shapely.to_ragged_array(
        shapely.simplify(lines, tol, preserve_topology=False)
    )
    sxy = sxy.astype(np.int64)
    full_n, simp_n = np.diff(off), np.diff(soff)
    keep = simp_n < 2
    while True:
        n = np.where(keep, full_n, simp_n)
        ring_nv = np.add.reduceat(n[ring_arcs] - 1, ring_off[:-1]) + 1
        bad = ring_arcs[np.repeat(ring_nv < 4, np.diff(ring_off))]
        if keep[bad].all():
            break
        keep[bad] = True
    both = np.concatenate([xy, sxy])
    start = np.where(keep, off[:-1], len(xy) + soff[:-1])
    out_off = offsets(n)
    out = both[ranges(start, n)]
    assert (out[out_off[:-1]] == xy[off[:-1]]).all()
    assert (out[out_off[1:] - 1] == xy[off[1:] - 1]).all()
    return out, out_off, int(keep.sum())


def unit_bbox(xy, ring_off, unit_ring_off):
    vo = ring_off[unit_ring_off]
    return np.minimum.reduceat(xy, vo[:-1]), np.maximum.reduceat(xy, vo[:-1])


def nested_refs(unit_order, unit_ring_off, ref_off, refs):
    nring = np.diff(unit_ring_off)[unit_order]
    ring = ranges(unit_ring_off[:-1][unit_order], nring)
    nref = np.diff(ref_off)[ring]
    vals = refs[ranges(ref_off[:-1][ring], nref)].astype(np.int32)
    inner = pa.ListArray.from_arrays(pa.array(offsets(nref).astype(np.int32)), vals)
    return pa.ListArray.from_arrays(pa.array(offsets(nring).astype(np.int32)), inner)


def arc_columns(order, xy, off, blob):
    n = np.diff(off)[order]
    v = xy[ranges(off[:-1][order], n)]
    o = offsets(n)
    d = v.copy()
    d[1:] -= v[:-1]
    d[o[:-1]] = v[o[:-1]]
    d = d.astype(np.int32)
    lo, hi = np.minimum.reduceat(v, o[:-1]), np.maximum.reduceat(v, o[:-1])
    if blob:
        buf = pa.py_buffer(d.astype("<i4").tobytes())
        xy_col = pa.Array.from_buffers(
            pa.binary(), len(n), [None, pa.py_buffer((o * 8).astype(np.int32)), buf]
        )
        coords = {"xy": xy_col}
    else:
        o32 = pa.array(o.astype(np.int32))
        coords = {
            "xs": pa.ListArray.from_arrays(o32, d[:, 0]),
            "ys": pa.ListArray.from_arrays(o32, d[:, 1]),
        }
    bbox = {
        "xmin": lo[:, 0].astype(np.int32),
        "ymin": lo[:, 1].astype(np.int32),
        "xmax": hi[:, 0].astype(np.int32),
        "ymax": hi[:, 1].astype(np.int32),
    }
    return coords, bbox


def parent_bounds(counts):
    """Row-group (start, end) rows holding whole parents, ~ROW_GROUP_ROWS rows each."""
    o = offsets(counts)
    first = np.flatnonzero(np.diff(o[:-1] // ROW_GROUP_ROWS, prepend=-1))
    return list(zip(o[first], np.append(o[first[1:]], o[-1])))


def write(table, path, bounds=None):
    tmp = path + ".tmp"  # readers may be polling the output dir; swap atomically
    with pq.ParquetWriter(tmp, table.schema, **PARQUET_OPTS) as w:
        for s, e in bounds if bounds is not None else [(0, len(table))]:
            w.write_table(table.slice(s, e - s), row_group_size=max(e - s, 1))
    os.replace(tmp, path)
    md = pq.ParquetFile(path).metadata
    logger.info(
        f"Wrote {path} :: {md.num_rows} rows, {md.num_row_groups} row groups, "
        f"{os.path.getsize(path):,} B, footer {md.serialized_size:,} B"
    )


def demography(df):
    integral = all((df[c] == np.round(df[c])).all() for c in df)
    dtype = np.int32 if integral else np.float64  # TX v2: all integral, max 25,582
    return {c: df[c].to_numpy().astype(dtype) for c in df}


def build(parent_gpkg, child_gpkg, out_root, name, county=None):
    # ponytail: one in-memory pass, ~14 GB peak RSS for TX blocks (38M ring vertices, 58 s).
    # Split by county and merge arcs if a bigger state outgrows the build machine.
    t0 = time.time()
    p_where = f"path LIKE 'vtd:{county}%'" if county else None
    c_where = f"path LIKE '{county}%'" if county else None
    p_paths, p_demog, p_geoms = read_units(parent_gpkg, p_where)
    c_paths, c_demog, c_geoms = read_units(child_gpkg, c_where)
    assert list(p_demog.columns) == list(c_demog.columns)
    P, C = len(p_paths), len(c_paths)

    # crosswalk: each child's point on surface lies in exactly one parent
    c_label = shapely.point_on_surface(c_geoms)
    ci, pi = shapely.STRtree(p_geoms).query(c_label, predicate="within")
    assert (np.bincount(ci, minlength=C) == 1).all(), "child not in exactly one parent"
    c_parent = np.empty(C, np.int64)
    c_parent[ci] = pi
    p_label = shapely.point_on_surface(p_geoms)
    logger.info(f"Crosswalk + labels :: {time.time() - t0:.1f}s")

    c_xy, c_ring_off, c_unit_ring_off = rings(c_geoms)
    p_xy, p_ring_off, p_unit_ring_off = rings(p_geoms)
    del c_geoms, p_geoms
    x0, y0 = c_xy.min(0)
    vkeys, c_vid = np.unique(
        ((c_xy[:, 0] - x0) << 32) | (c_xy[:, 1] - y0), return_inverse=True
    )
    nv = len(vkeys)
    p_key = ((p_xy[:, 0] - x0) << 32) | (p_xy[:, 1] - y0)
    p_vid = np.searchsorted(vkeys, p_key)
    assert (
        vkeys[np.minimum(p_vid, nv - 1)] == p_key
    ).all(), "parent vertex not in children"
    vxy = np.stack([(vkeys >> 32) + x0, (vkeys & 0xFFFFFFFF) + y0], 1)
    logger.info(
        f"{len(c_xy)} child ring vertices, {nv} unique :: {time.time() - t0:.1f}s"
    )

    c_ring_unit = np.repeat(np.arange(C), np.diff(c_unit_ring_off))
    sa, sb, c_seg_off = segments(c_vid, c_ring_off)
    arc_vid, arc_off, arc_a, arc_b, c_refs, c_ref_off, lookup = build_arcs(
        sa, sb, c_seg_off, c_ring_unit, nv
    )
    del sa, sb
    sa, sb, p_seg_off = segments(p_vid, p_ring_off)
    p_refs, _, p_ref_off = ring_refs(sa, sb, p_seg_off, lookup)
    del sa, sb
    arc_xy = vxy[arc_vid]
    na = len(arc_off) - 1
    logger.info(f"{na} arcs, {len(arc_xy)} arc vertices :: {time.time() - t0:.1f}s")

    # ordering: parents Hilbert by bbox center, children/interior arcs grouped by parent
    p_lo, p_hi = unit_bbox(p_xy, p_ring_off, p_unit_ring_off)
    c_lo, c_hi = unit_bbox(c_xy, c_ring_off, c_unit_ring_off)
    p_order = np.argsort(hilbert(*((p_lo + p_hi) // 2).T), kind="stable")
    p_new = np.empty(P, np.int64)
    p_new[p_order] = np.arange(P)
    c_order = np.lexsort((c_paths.astype(str), p_new[c_parent]))
    c_new = np.empty(C, np.int64)
    c_new[c_order] = np.arange(C)

    a_par = p_new[c_parent[arc_a]]
    b_par = np.where(arc_b >= 0, p_new[c_parent[arc_b]], -1)
    ext = a_par != b_par
    lo_par = np.where(b_par < 0, a_par, np.minimum(a_par, b_par))
    hi_par = np.where(b_par < 0, P, np.maximum(a_par, b_par))
    ext_order = np.flatnonzero(ext)[np.lexsort((hi_par[ext], lo_par[ext]))]
    a_new, b_new = c_new[arc_a], np.where(arc_b >= 0, c_new[np.maximum(arc_b, 0)], -1)
    inn = np.flatnonzero(~ext)
    int_order = inn[np.lexsort((np.minimum(a_new, b_new)[inn], a_par[inn]))]
    E = len(ext_order)
    arc_new = np.empty(na, np.int64)
    arc_new[ext_order] = np.arange(E)
    arc_new[int_order] = E + np.arange(len(int_order))

    def remap(refs):
        return np.where(
            refs >= 0, arc_new[np.maximum(refs, 0)], ~arc_new[~np.minimum(refs, -1)]
        )

    c_refs, p_refs = remap(c_refs), remap(p_refs)
    p_ref_arc = np.where(p_refs >= 0, p_refs, ~p_refs)
    assert (p_ref_arc < E).all(), "parent ring uses an interior arc"
    logger.info(f"{E} exterior arcs, {na - E} interior arcs :: {time.time() - t0:.1f}s")

    # geodesic measures from full resolution
    c_area = np.add.reduceat(ring_geodesic_area(c_xy, c_ring_off), c_unit_ring_off[:-1])
    p_area = np.add.reduceat(ring_geodesic_area(p_xy, p_ring_off), p_unit_ring_off[:-1])
    assert (c_area > 0).all() and (p_area > 0).all()
    arc_len = arc_lengths(arc_xy, arc_off)
    logger.info(f"Areas + lengths :: {time.time() - t0:.1f}s")

    # parent row ranges into children / arcs_interior
    c_count = np.bincount(p_new[c_parent], minlength=P)
    i_count = np.bincount(a_par[int_order], minlength=P)
    c_start, i_start = offsets(c_count)[:-1], offsets(i_count)[:-1]

    def label(points, order):
        xy = np.rint(shapely.get_coordinates(points[order]) * SCALE).astype(np.int32)
        return {"label_x": xy[:, 0], "label_y": xy[:, 1]}

    def bbox(lo, hi, order):
        return {
            "xmin": lo[order, 0].astype(np.int32),
            "ymin": lo[order, 1].astype(np.int32),
            "xmax": hi[order, 0].astype(np.int32),
            "ymax": hi[order, 1].astype(np.int32),
        }

    pd_cols, cd_cols = demography(p_demog), demography(c_demog)
    parents = pa.table(
        {
            "path": pa.array(p_paths[p_order].astype(str)),
            **{k: v[p_order] for k, v in pd_cols.items()},
            "area_m2": p_area[p_order],
            **label(p_label, p_order),
            **bbox(p_lo, p_hi, p_order),
            "rings": nested_refs(p_order, p_unit_ring_off, p_ref_off, p_refs),
            "child_row_start": c_start.astype(np.int32),
            "child_row_count": c_count.astype(np.int32),
            "interior_row_start": i_start.astype(np.int32),
            "interior_row_count": i_count.astype(np.int32),
        }
    )
    children = pa.table(
        {
            "path": pa.array(c_paths[c_order].astype(str)),
            "parent_idx": p_new[c_parent[c_order]].astype(np.int32),
            **{k: v[c_order] for k, v in cd_cols.items()},
            "area_m2": c_area[c_order],
            **label(c_label, c_order),
            **bbox(c_lo, c_hi, c_order),
            "rings": nested_refs(c_order, c_unit_ring_off, c_ref_off, c_refs),
        }
    )

    # ring -> arc table (in old arc ids) for the simplifier's degeneracy guard
    ring_arcs = np.concatenate([c_refs, p_refs])
    ring_arcs = np.where(ring_arcs >= 0, ring_arcs, ~ring_arcs)
    old_of_new = np.empty(na, np.int64)
    old_of_new[arc_new] = np.arange(na)
    ring_arcs = old_of_new[ring_arcs]
    ring_arcs_off = np.concatenate([c_ref_off, c_ref_off[-1] + p_ref_off[1:]])

    for variant in ["full", "simplified"]:
        out = os.path.join(out_root, variant, name)
        os.makedirs(out, exist_ok=True)
        if variant == "full":
            vxy_, voff = arc_xy, arc_off
        else:
            for tol in [10, 20, 100]:
                _, o, kept = simplify(arc_xy, arc_off, tol, ring_arcs, ring_arcs_off)
                logger.info(
                    f"Simplified at {tol / SCALE:g} deg :: {o[-1]} vertices, {kept} arcs kept full"
                )
            vxy_, voff, _ = simplify(
                arc_xy, arc_off, SIMPLIFY_TOLERANCE, ring_arcs, ring_arcs_off
            )
        sides_ext = {
            "a_parent": a_par[ext_order].astype(np.int32),
            "b_parent": b_par[ext_order].astype(np.int32),
            "a_child": a_new[ext_order].astype(np.int32),
            "b_child": b_new[ext_order].astype(np.int32),
            "length_m": arc_len[ext_order],
        }
        for blob, fname in [(False, "arcs_exterior"), (True, "arcs_exterior_blob")]:
            coords, abox = arc_columns(ext_order, vxy_, voff, blob)
            write(
                pa.table({**coords, **sides_ext, **abox}),
                os.path.join(out, f"{fname}.parquet"),
            )
        coords, abox = arc_columns(int_order, vxy_, voff, False)
        interior = pa.table(
            {
                "parent_idx": a_par[int_order].astype(np.int32),
                **coords,
                "a_child": a_new[int_order].astype(np.int32),
                "b_child": b_new[int_order].astype(np.int32),
                "length_m": arc_len[int_order],
                **abox,
            }
        )
        write(
            interior, os.path.join(out, "arcs_interior.parquet"), parent_bounds(i_count)
        )
        if variant == "full":
            write(parents, os.path.join(out, "parents.parquet"))
            write(
                children, os.path.join(out, "children.parquet"), parent_bounds(c_count)
            )
            full_dir = out
        else:
            for f in ["parents.parquet", "children.parquet"]:
                shutil.copyfile(
                    os.path.join(full_dir, f), os.path.join(out, f + ".tmp")
                )
                os.replace(os.path.join(out, f + ".tmp"), os.path.join(out, f))
    logger.info(f"Done :: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("parent_gpkg")
    ap.add_argument("child_gpkg")
    ap.add_argument("out_root")
    ap.add_argument("name")
    ap.add_argument("--county", help="5-digit county FIPS subset, e.g. 48453 (Travis)")
    args = ap.parse_args()
    build(args.parent_gpkg, args.child_gpkg, args.out_root, args.name, args.county)
