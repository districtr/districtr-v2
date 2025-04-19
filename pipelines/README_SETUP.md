# Districtr Pipelines Setup

This document explains how to set up and run the Districtr pipelines package.

## Installation

To install the package in development mode, run the following command from the pipelines directory:

```bash
pip install -e .
```

This will install the package in development mode, which means that any changes you make to the code will be immediately reflected in the installed package.

## Running commands

There are several ways to run commands:

### 1. Using the python module syntax

```bash
# From the pipelines directory
python -m tilesets create-gerrydb-tileset --layer <layer> --gpkg <gpkg>
```

### 2. Using the main entry point

```bash
# From the pipelines directory
python -m tilesets create-gerrydb-tileset --layer <layer> --gpkg <gpkg>
```

### 3. Using the executable script

```bash
# From the pipelines directory
./bin/run_tilesets.py create-gerrydb-tileset --layer <layer> --gpkg <gpkg>
```

## Available commands

The package provides the following commands:

### tilesets

- `create-gerrydb-tileset`: Create a tileset from a GeoPackage file
- `merge-gerrydb-tilesets`: Merge two tilesets
- `batch-create-tilesets`: Batch create tilesets from a config file
- `create-county-tiles`: Create county tiles

### Example usage

```bash
# Create a GerryDB tileset
python -m tilesets create-gerrydb-tileset --layer states --gpkg path/to/states.gpkg

# Merge two tilesets
python -m tilesets merge-gerrydb-tilesets --out-name merged --parent-layer path/to/parent.pmtiles --child-layer path/to/child.pmtiles
``` 