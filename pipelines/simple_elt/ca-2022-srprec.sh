#!/bin/bash
mkdir -p assets
cd assets

rm -f my.duckdb

# Download the 2021 California precinct shapefile
PRECINCTS="srprec_state_g22_v01_shp"
if ! test -f $PRECINCTS.parquet; then
    echo "Downloading $PRECINCTS"
    curl --progress-bar https://statewidedatabase.org/pub/data/G22/state/$PRECINCTS.zip -o $PRECINCTS.zip

    unzip -o $PRECINCTS.zip
    rm $PRECINCTS.zip

    ogrinfo $PRECINCTS.shp $PRECINCTS -so

    ogr2ogr \
        $PRECINCTS.parquet \
        $PRECINCTS.shp \
        -dialect SQLite \
        -sql "SELECT * FROM '$PRECINCTS'" \
        -lco COMPRESSION=ZSTD \
        -lco ROW_GROUP_SIZE=9999999 \
        -t_srs EPSG:4326
fi

# Download the precinct to block crosswalk
BLK_XWALK="state_g22_sr_blk_map"
if ! test -f $BLK_XWALK.csv; then
    echo "Downloading $BLK_XWALK"
    curl --progress-bar https://statewidedatabase.org/pub/data/G22/state/$BLK_XWALK.csv -o $BLK_XWALK.csv
fi

# Download 2022 CA blocks
BLK_SHP="tl_2022_06_tabblock20"
if ! test -f $BLK_SHP.parquet; then
    echo "Downloading $BLK_SHP"
    curl --progress-bar https://www2.census.gov/geo/tiger/TIGER2022/TABBLOCK20/$BLK_SHP.zip -o $BLK_SHP.zip

    mkdir -p $BLK_SHP

    unzip -o $BLK_SHP.zip -d $BLK_SHP
    rm $BLK_SHP.zip

    ogrinfo $BLK_SHP/$BLK_SHP.shp $BLK_SHP -so

    ogr2ogr \
        $BLK_SHP.parquet \
        $BLK_SHP/$BLK_SHP.shp \
        -dialect SQLite \
        -sql "SELECT * FROM '$BLK_SHP'" \
        -lco COMPRESSION=ZSTD \
        -lco ROW_GROUP_SIZE=9999999 \
        -t_srs EPSG:4326
fi

rm -rf $BLK_SHP

echo "Calculating precinct populations and generating PMTiles"
duckdb my.duckdb "
INSTALL SPATIAL; LOAD SPATIAL;

CREATE TABLE $PRECINCTS AS SELECT * FROM '$PRECINCTS.parquet';

CREATE TABLE $BLK_XWALK AS SELECT * FROM '$BLK_XWALK.csv';

CREATE TABLE $BLK_SHP AS SELECT * FROM '$BLK_SHP.parquet';

CREATE TABLE precincts AS
SELECT
    p.SRPREC_KEY AS srprec_key,
    pop20,
    ST_GeomFromWKB(geometry) AS geometry,
FROM $PRECINCTS p
LEFT JOIN (
    SELECT
        x.SRPREC_KEY,
        SUM((x.PCTBLK / 100) * bg.POP20) AS pop20
    FROM $BLK_XWALK x
    LEFT JOIN $BLK_SHP bg
    ON x.BLOCK_KEY = bg.GEOID20
    GROUP BY x.SRPREC_KEY
    )
USING(SRPREC_KEY);

SELECT SUM(pop20) FROM precincts;
COPY (
    SELECT
        *
    FROM precincts
    WHERE geometry IS NOT NULL
)
TO 'precincts.fgb'
WITH (
    FORMAT GDAL,
    DRIVER 'FlatGeoBuf',
    SRS 'EPSG:4326'
);
" && tippecanoe \
    -zg \
    --force \
    --no-feature-limit \
    --no-tile-size-limit \
    -o precincts.pmtiles \
    -l precincts precincts.fgb
