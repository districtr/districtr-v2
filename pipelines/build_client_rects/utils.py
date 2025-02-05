import geopandas as gpd
import pandas as pd
import shapely.geometry as sg
import numpy as np
from tqdm import tqdm
import json

OUT_DATA_COLS = [
    "total_pop",
    "nhpi_pop",
    "other_pop",
    "amin_pop",
    "asian_pop",
    "white_pop",
    "black_pop",
    "two_or_more_races_pop",
]


def generate_cells(
    bounds: tuple,
    size: float,
):
    """Generate a grid of cells within the given bounds."""
    minx, miny, maxx, maxy = bounds
    cells = []
    for x in np.arange(minx, maxx, size):
        for y in np.arange(miny, maxy, size):
            cells.append(sg.box(x, y, x + size, y + size))
    return cells


def merge_squares_to_rectangles(gdf):
    """
    Given a GeoDataFrame of square polygons, merge them into the smallest number of contiguous
    rectangles without creating irregular shapes.

    Parameters:
    gdf (GeoDataFrame): GeoDataFrame containing square polygons.

    Returns:
    GeoDataFrame: GeoDataFrame containing merged rectangles.
    """
    # Extract all unique coordinates of squares
    min_x, min_y, max_x, max_y = [], [], [], []

    for geom in gdf.geometry:
        bounds = geom.bounds  # (minx, miny, maxx, maxy)
        min_x.append(bounds[0])
        min_y.append(bounds[1])
        max_x.append(bounds[2])
        max_y.append(bounds[3])

    # Convert to NumPy array for fast processing
    min_x, min_y, max_x, max_y = map(np.array, [min_x, min_y, max_x, max_y])

    # Identify unique grid values
    x_vals = np.unique(np.concatenate((min_x, max_x)))
    y_vals = np.unique(np.concatenate((min_y, max_y)))

    # Create a binary grid representation
    grid = np.zeros((len(y_vals) - 1, len(x_vals) - 1), dtype=bool)

    for i in range(len(min_x)):
        x_idx = np.where(x_vals == min_x[i])[0][0]
        y_idx = np.where(y_vals == min_y[i])[0][0]
        grid[y_idx, x_idx] = True

    # Merge squares into larger rectangles
    rectangles = []

    while np.any(grid):
        # Find the first filled square
        y, x = np.argwhere(grid)[0]

        # Expand right
        x_end = x
        while x_end + 1 < grid.shape[1] and grid[y, x_end + 1]:
            x_end += 1

        # Expand down
        y_end = y
        while y_end + 1 < grid.shape[0] and np.all(grid[y : y_end + 2, x : x_end + 1]):
            y_end += 1

        # Create rectangle
        rect = sg.Polygon(
            [
                (x_vals[x], y_vals[y]),
                (x_vals[x_end + 1], y_vals[y]),
                (x_vals[x_end + 1], y_vals[y_end + 1]),
                (x_vals[x], y_vals[y_end + 1]),
            ]
        )
        rectangles.append(rect)

        # Remove covered squares from grid
        grid[y : y_end + 1, x : x_end + 1] = False
    gdf = gpd.GeoDataFrame(geometry=rectangles, crs=gdf.crs)
    # buffer by 10
    gdf["geometry"] = gdf.buffer(1)
    gdf["minY"] = gdf.bounds.miny
    gdf["maxY"] = gdf.bounds.maxy
    gdf["minmaxy"] = gdf["minY"].astype(str) + gdf["maxY"].astype(str)
    gdf = gdf.dissolve(by="minmaxy").reset_index()
    # Create new GeoDataFrame
    return gdf


def convert_geometry_to_cells(
    geometry: sg.Polygon | sg.MultiPolygon,
    min_coverage: float,
    max_coverage_overlap: float,
    crs: str = "EPSG:26913",
    min_cell_coverage: float = 0.75,
    max_iters: int = 10,
):
    bounds = geometry.bounds
    coverage = False
    iters = 0
    # start at 20% of geometry
    cell_size = None

    while not coverage and iters < max_iters:
        iters += 1
        if cell_size is None:
            cell_size = 0.2 * max(bounds[2] - bounds[0], bounds[3] - bounds[1])
        else:
            cell_size /= 2

        cells = generate_cells(bounds, cell_size)
        cells = gpd.GeoDataFrame(geometry=cells, crs=crs)
        # print(f"Cell size: {cell_size} ; {len(cells)} cells")
        cells["area"] = cells.geometry.area
        cells = cells[cells.intersects(geometry)]
        # filter for cells that are outside the geometry
        cells = cells[
            cells.intersection(geometry).area / cells.area >= min_cell_coverage
        ]
        if len(cells) == 0:
            continue
        # dissolve the cells, then check the overall coverage
        dissolved = cells.dissolve()
        # how much geometry area is covered by the dissolved
        covered = dissolved.intersection(geometry).area / geometry.area
        # how much area of dissolved extends beyond the geometry
        difference = 1 + dissolved.difference(geometry).area / geometry.area
        if covered[0] >= min_coverage and difference[0] <= max_coverage_overlap:
            coverage = True
    return cells


def process_geodataframe(
    gdf: gpd.GeoDataFrame,
    cols: list[str] = OUT_DATA_COLS,
    min_coverage: float = 0.85,
    max_coverage_overlap: float = 1.15,
    min_cell_coverage: float = 0.75,
    output_json: bool = True,
    output_gpkg: bool = True,
    outpath: str = "",
):
    """Processes a GeoDataFrame to convert geometries into fitted rectandles."""
    co_simplified_dict = {}
    gdfs = []
    for _, row in tqdm(gdf.iterrows()):
        cells = convert_geometry_to_cells(
            row.geometry,
            min_coverage=min_coverage,
            max_coverage_overlap=max_coverage_overlap,
            min_cell_coverage=min_cell_coverage,
            crs=gdf.crs,
        )
        merged = merge_squares_to_rectangles(cells).to_crs("EPSG:4326")
        merged["path"] = row["path"]
        gdfs.append(merged)
        co_simplified_dict[row["path"]] = {
            "properties": {col: row[col] for col in cols},
            "bboxes": list(
                merged.bounds.apply(
                    lambda row: {
                        "minX": round(row.iloc[0], 5),
                        "minY": round(row.iloc[1], 5),
                        "maxX": round(row.iloc[2], 5),
                        "maxY": round(row.iloc[3], 5),
                    },
                    axis=1,
                )
            ),
        }
    combined_gdf = gpd.GeoDataFrame(pd.concat(gdfs, ignore_index=True))

    if output_gpkg:
        combined_gdf.to_file(outpath + "rects.gpkg")
    if output_json:
        with open(outpath + "rects.json", "w") as f:
            f.write(json.dumps(co_simplified_dict))

    return {"json_output": co_simplified_dict, "gdf": combined_gdf}
