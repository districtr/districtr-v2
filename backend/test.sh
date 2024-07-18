#!/bin/bash
alembic upgrade head
pytest -v
