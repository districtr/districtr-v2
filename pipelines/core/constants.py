from os import environ
from core.settings import settings

S3_BASEMAPS_PREFIX = "basemaps"
S3_TABULAR_PREFIX = "tabular"
# County TIGER layers

S3_TILESETS_PREFIX = "tilesets"
TIGER_YEAR = 2023
TIGER_COUNTY_URL = f"https://www2.census.gov/geo/tiger/TIGER{TIGER_YEAR}/COUNTY/tl_{TIGER_YEAR}_us_county.zip"
S3_TIGER_PREFIX = f"tiger/tiger{TIGER_YEAR}"

# GerryDB

DEFAULT_GERRYDB_COLUMNS = [
    "path",
    "geography",
    "total_pop_20",
]

GPKG_DATA_DIR = environ.get("GPKG_DATA_DIR", settings.OUT_SCRATCH)
