#!/bin/bash
gerrydb="$1"

if [ -z "$gerrydb" ]; then
    echo "Usage: $0 <gerrydb> [verbose_mode]"
    exit 1
fi

load_gerrydb_view() {
    layer=$(./scripts/print_gerrydb_layer_info.sh "$file")
    echo "$layer"
    python cli.py import-gerrydb-view \
        -g "$file" \
        --layer "$layer" \
        -f
    python cli.py create-gerrydb-tileset \
        -g "$file" \
        --layer "$layer" \
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
