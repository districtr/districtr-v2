# ELT

## Developer set-up

### Python

Dependencies are managed with uv as noted in the root README. Follow set-up instructions [there](../README.md#python).

1. `uv venv`
1. `source venv/bin/activate`
1. `uv pip install -r requirements.txt`

### Geospatial libraries

Follow the [installation instructions](https://docs.djangoproject.com/en/5.0/ref/contrib/gis/install/geolibs/) for GeoDjango. Although we are not using Django, the instructions are super useful / kept up-to-date.

You'll need `ogr2ogr` installed, part of GDAL. You can test that it was installed properly with `which ogr2ogr` or `ogr2ogr --version`.

### DuckDB

Follow [DuckDB installation instructions](https://duckdb.org/docs/installation/)

### Tippecanoe

Follow [Tippecanoe installation instructions](https://github.com/felt/tippecanoe?tab=readme-ov-file#installation).
