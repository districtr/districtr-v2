/*
TODO: Allow for schemas that have shared attributes but aren't
completely identical. For now just enforcing identifcal schemas
by having this fail if the schemas aren't identical.
*/
CREATE OR REPLACE PROCEDURE create_shatterable_gerrydb_view(
    parent_gerrydb_table_name TEXT,
    child_gerrydb_table_name TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    sql_query TEXT;

BEGIN
    sql_query := format('
        CREATE MATERIALIZED VIEW gerrydb.%I AS
        SELECT * FROM gerrydb.%I
        UNION ALL
        SELECT *
        FROM gerrydb.%I
    ', parent_gerrydb_table_name, child_gerrydb_table_name);

    EXECUTE sql_query;
END;
$$;
