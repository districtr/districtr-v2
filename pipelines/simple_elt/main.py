import os
import requests
import geopandas as gpd
import pandas as pd

ASSETS_DIR = "./assets"
WISCONSIN_2023_TABBLOCK20 = (
    "https://www2.census.gov/geo/tiger/TIGER2023/TABBLOCK20/tl_2023_55_tabblock20.zip"
)
BLOCK_COLS = ["GEOID20", "ALAND20", "POP20", "HOUSING20", "geometry"]


def main():
    if not os.path.exists(ASSETS_DIR):
        os.mkdir(ASSETS_DIR)

    if not os.path.exists(f"{ASSETS_DIR}/tl_2023_55_tabblock20.zip"):
        r = requests.get(WISCONSIN_2023_TABBLOCK20)
        with open(f"{ASSETS_DIR}/tl_2023_55_tabblock20.zip", "wb") as f:
            f.write(r.content)

    if not os.path.exists(f"{ASSETS_DIR}/tl_2023_55_tabblock20.shp"):
        os.system(f"unzip {ASSETS_DIR}/tl_2023_55_tabblock20.zip -d {ASSETS_DIR}")

    gdf = gpd.read_file(f"{ASSETS_DIR}/tl_2023_55_tabblock20.shp")[BLOCK_COLS].copy()

    print(gdf.info())

    for col in BLOCK_COLS:
        if col not in ["GEOID20", "geometry"]:
            gdf[col] = pd.to_numeric(gdf[col], downcast="unsigned")

    invalid_geom_indices = gdf.index[~gdf.geometry.is_valid]
    gdf.drop(invalid_geom_indices, inplace=True)

    print(gdf.info())

    gdf.to_parquet(
        f"{ASSETS_DIR}/tl_2023_55_tabblock20.parquet",
        compression="brotli",
        row_group_size=len(gdf),
        index=False,
    )


if __name__ == "__main__":
    main()
