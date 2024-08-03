#!/bin/bash
gerrydb="$1"

if [ -z "$gerrydb" ]; then
    gerrydb="s3://districtr-v2-dev"
fi

# This one isn't in the R2 bucket
# cacef60accf646e89f41918f99132c01.gpkg pa_demo_view_census_blocks

for i in "c6c23a64a3234171853c9897095f001b.gpkg ks_demo_view_census_vtd" \
    "c22cea3c83e14fd79be9a69c87dd089c.gpkg de_demo_view_census_vtd" \
    "8f8f71971337445480a802cdfd8a951a.gpkg ks_demo_view_census_blocks" \
    "89bb5423a5784d35a57d290f63b687a0.gpkg pa_demo_view_census_vtd" \
    "488c6946a0d5487eaad3a801df8862db.gpkg de_demo_view_census_blocks"
do
    set -- $i
    python cli.py import-gerrydb-view \
        -g "$gerrydb/$1" \
        --layer "$2" \
        -f
    python cli.py create-gerrydb-tileset \
        -g "$gerrydb/$1" \
        --layer "$2" \
        -f
done
