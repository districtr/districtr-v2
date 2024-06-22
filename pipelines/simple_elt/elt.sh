#!/bin/bash
ogr2ogr \
  assets/wisconsin_blocks.parquet \
  assets/tl_2023_55_tabblock20.shp \
  -dialect SQLite \
  -sql "SELECT geoid20, pop20, geometry FROM 'tl_2023_55_tabblock20'" \
  -lco COMPRESSION=BROTLI \
  -lco GEOMETRY_ENCODING=GEOARROW \
  -lco POLYGON_ORIENTATION=COUNTERCLOCKWISE \
  -lco ROW_GROUP_SIZE=9999999
