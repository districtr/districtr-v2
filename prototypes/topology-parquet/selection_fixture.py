"""Brush-selection fixture for the topology prototype, computed with shapely on source geometry.

Picks random disks and capsules in Mercator (0..1) units over a topology's extent, shatters a
deterministic subset of parents, and records which active units (unshattered parents plus
children of shattered parents) are within distance r of each brush. The bun test
app/src/app/utils/topology/selectFixture.test.ts compares selectUnits against it.

    backend/.venv/bin/python prototypes/topology-parquet/selection_fixture.py \\
        TOPOLOGY_DIR PARENT_GPKG CHILD_GPKG OUT_JSON [--county 48453] [--seed 1]
"""

import argparse
import json

import numpy as np
import pyarrow.parquet as pq
import pyogrio
import shapely


def mercator(geom):
    """Raw lon/lat (as stored; no datum shift) to MapLibre Mercator units."""

    def f(xy):
        lon, lat = xy[:, 0], xy[:, 1]
        y = 0.5 - np.log(np.tan(np.pi / 4 + lat * np.pi / 360)) / (2 * np.pi)
        return np.column_stack([(lon + 180) / 360, y])

    return shapely.transform(geom, f)


def read_units(gpkg, paths, where):
    df = pyogrio.read_dataframe(gpkg, columns=["path"], where=where)
    df = df[df["path"].isin(paths)].set_index("path")
    missing = set(paths) - set(df.index)
    assert not missing, f"{len(missing)} paths missing from {gpkg}"
    return mercator(df.loc[list(paths)].geometry.values)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("topology_dir")
    ap.add_argument("parent_gpkg")
    ap.add_argument("child_gpkg")
    ap.add_argument("out")
    ap.add_argument("--county", default="48453")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--disks", type=int, default=1000)
    ap.add_argument("--capsules", type=int, default=250)
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)

    parents = pq.read_table(f"{a.topology_dir}/parents.parquet", columns=["path"])
    parent_paths = parents.column("path").to_pylist()
    children = pq.read_table(f"{a.topology_dir}/children.parquet", columns=["path", "parent_idx"])
    child_paths = np.array(children.column("path").to_pylist())
    child_parent = children.column("parent_idx").to_numpy()

    shattered = np.sort(rng.choice(len(parent_paths), len(parent_paths) // 4, replace=False))
    is_shattered = np.zeros(len(parent_paths), bool)
    is_shattered[shattered] = True
    active_parents = [p for i, p in enumerate(parent_paths) if not is_shattered[i]]
    active_children = list(child_paths[is_shattered[child_parent]])

    geoms = np.concatenate(
        [
            read_units(a.parent_gpkg, active_parents, f"path LIKE 'vtd:{a.county}%'"),
            read_units(a.child_gpkg, active_children, f"path LIKE '{a.county}%'"),
        ]
    )
    paths = np.array(active_parents + active_children)
    tree = shapely.STRtree(geoms)
    xmin, ymin, xmax, ymax = shapely.total_bounds(geoms)

    boundaries = shapely.boundary(geoms)
    cases = []
    for k in range(a.disks + a.capsules):
        # Brush radii between ~1 px at z8 and ~100 px at z14; one disk in ten is a click (r = 0).
        click = k < a.disks and rng.random() < 0.1
        r = 0.0 if click else float(np.exp(rng.uniform(np.log(2e-7), np.log(5e-5))))
        if k % 2:
            p = rng.uniform([xmin, ymin], [xmax, ymax])
        else:
            # Half the brushes sit within ~r of a unit boundary, where edge tests decide.
            edge = boundaries[rng.integers(len(boundaries))]
            on = shapely.line_interpolate_point(edge, rng.random(), normalized=True)
            p = np.array([on.x, on.y]) + rng.normal(0, max(r, 1e-7), 2)
        q = p
        if k >= a.disks:
            angle = rng.uniform(0, 2 * np.pi)
            q = p + rng.uniform(0, 1e-4) * np.array([np.cos(angle), np.sin(angle)])
        brush = shapely.Point(p) if k < a.disks else shapely.LineString([p, q])
        idx = tree.query(brush, predicate="dwithin", distance=r)
        # Units whose distance is within rounding of r either way: tangent ties.
        eps = 1e-6 * r + 1e-12
        near = tree.query(brush, predicate="dwithin", distance=r + eps)
        # Boundary distance, so a click (r = 0) inside a unit is only a tie near its edge.
        near = near[np.abs(shapely.distance(shapely.boundary(geoms[near]), brush) - r) <= eps]
        cases.append(
            {
                "p": [float(p[0]), float(p[1])],
                "q": [float(q[0]), float(q[1])],
                "r": r,
                "expect": sorted(paths[idx].tolist()),
                "ties": sorted(paths[near].tolist()),
            }
        )

    with open(a.out, "w") as f:
        json.dump({"shattered": shattered.tolist(), "cases": cases}, f)
    hits = [len(c["expect"]) for c in cases]
    print(
        f"{len(cases)} cases, {len(shattered)} shattered parents, {len(paths)} active units; "
        f"hits per case min {min(hits)} median {int(np.median(hits))} max {max(hits)}; "
        f"{sum(bool(c['ties']) for c in cases)} cases with ties"
    )


if __name__ == "__main__":
    main()
