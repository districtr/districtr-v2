from pathlib import Path


SQL_DIR = Path(__file__).resolve().parent / "sql"

# must match the schema created in the database, see
# migration `966d8d72887e_add_gerrydb_schema.py`
# DO NOT CHANGE THIS CONSTANT
GERRY_DB_SCHEMA = "gerrydb"
DOCUMENT_SCHEMA = "document"
LEGACY_VIEWS = ["co_p1_view", "ks_p14_view", "ks_p14_view_stateleg", "pa_p14_view"]
