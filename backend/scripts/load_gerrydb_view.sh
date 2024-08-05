#!/bin/bash
gerrydb="$1"

if [ -z "$gerrydb" ]; then
    echo "Usage: $0 <gerrydb> [verbose_mode]"
    exit 1
fi


get_columns() {
    file="$1"
    layer="$2"
    columns=$(ogrinfo "$file" "$layer" -so | awk -F ':' '/path|total_pop|total_vap/{gsub(/^ +| +$/, "", $1); print "-c " $1}' | paste -sd ' ' -)
    echo "$columns"
}

load_gerrydb_view() {
    layer=$(./scripts/print_gerrydb_layer_info.sh "$file")
    echo "$layer"
    python cli.py import-gerrydb-view \
        -g "$file" \
        --layer "$layer" \
        -f
    columns=$(get_columns "$file" "$layer")
    echo "matched columns: $columns"
    python cli.py create-gerrydb-tileset \
        -g "$file" \
        --layer "$layer" \
        $columns \
        -c geography \
        -f
}

if [ -d "$gerrydb" ]; then
    for file in "$gerrydb"/*.gpkg; do
        load_gerrydb_view "$file"
    done
else
    file="$gerrydb"
    load_gerrydb_view "$file"
fi
