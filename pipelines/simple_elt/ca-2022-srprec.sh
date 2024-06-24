#!/bin/bash
mkdir -p assets
cd assets

# Download the 2021 California precinct shapefile
PRECINCTS="srprec_state_g22_v01_shp"
curl --progress-bar https://statewidedatabase.org/pub/data/G22/state/$PRECINCTS.zip -o $PRECINCTS.zip

unzip -o $PRECINCTS.zip
rm $PRECINCTS.zip

ogrinfo $PRECINCTS.shp $PRECINCTS -so

if ! test -f $PRECINCTS.parquet; then
    ogr2ogr \
        $PRECINCTS.parquet \
        $PRECINCTS.shp \
        -dialect SQLite \
        -sql "SELECT * FROM '$PRECINCTS'" \
        -lco COMPRESSION=ZSTD \
        -lco ROW_GROUP_SIZE=9999999 \
        -t_srs EPSG:4326
fi

rm -f my.duckdb

duckdb my.duckdb "INSTALL SPATIAL; LOAD SPATIAL;"
duckdb my.duckdb "CREATE TABLE $PRECINCTS AS SELECT * FROM '$PRECINCTS.parquet'"

# Download the precinct to block crosswalk
BLK_XWALK="state_g22_sr_blk_map"
curl --progress-bar https://statewidedatabase.org/pub/data/G22/state/$BLK_XWALK.csv -o $BLK_XWALK.csv

duckdb my.duckdb "CREATE TABLE $BLK_XWALK AS SELECT * FROM '$BLK_XWALK.csv'"
