#!/bin/bash
gerrydb="$1"
verbose_mode=${2:-0}

if [ -z "$gerrydb" ]; then
    echo "Usage: $0 <gerrydb> [verbose_mode]"
    exit 1
fi

print_layer_info() {
    file="$1"
    local layer=$(ogrinfo "$file" -so 2>/dev/null | grep -m 1 '^1: ' | awk '{print $2}')
    echo "$layer"
    if [ "$verbose_mode" -eq 1 ]; then
        ogrinfo "$file" "$layer" -so
    fi
}

if [ -d "$gerrydb" ]; then
    for file in "$gerrydb"/*.gpkg; do
        print_layer_info "$file"
    done
else
    file="$gerrydb"
    print_layer_info "$file"
fi
