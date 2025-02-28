"""tileset constants"""

S3_PREFIX = "basemaps"

# County TIGER layers

TIGER_YEAR = 2023
TIGER_COUNTY_URL = f"https://www2.census.gov/geo/tiger/TIGER{TIGER_YEAR}/COUNTY/tl_{TIGER_YEAR}_us_county.zip"
S3_TIGER_PREFIX = f"tiger/tiger{TIGER_YEAR}"

# GerryDB

DEFAULT_GERRYDB_COLUMNS = [
    "path",
    "geography",
    "total_pop",
]
