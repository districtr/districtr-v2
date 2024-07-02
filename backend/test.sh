#!/bin/bash
python -c 'from app.core.db import create_collections; create_collections()'
pytest -v
