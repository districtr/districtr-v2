from pathlib import Path


# SQL that older migrations replay; the app calls no UDFs (ADR 0017).
SQL_DIR = Path(__file__).resolve().parent / "alembic" / "sql"

# must match the schema created in the database, see
# migration `966d8d72887e_add_gerrydb_schema.py`
# DO NOT CHANGE THIS CONSTANT
DOCUMENT_SCHEMA = "document"
CMS_SCHEMA = "cms"
COMMENTS_SCHEMA = "comments"
GERRY_DB_SCHEMA = "gerrydb"
PUBLIC_SCHEMA = "public"
