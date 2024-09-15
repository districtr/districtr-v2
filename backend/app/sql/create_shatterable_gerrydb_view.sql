/*
NOTE: This enforces identical schemas but requires that the child contain all the columns
except geometry that the parent has. In the future we may want to allow subsetting but
for now I think this is fine. It does make sure the columns are properly ordered which is nice.
*/
CREATE OR REPLACE PROCEDURE create_shatterable_gerrydb_view(
    parent_gerrydb_table_name TEXT,
    child_gerrydb_table_name TEXT,
    gerrydb_table_name TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    sql_query TEXT;
    col_list TEXT := '*'; -- Don't think we really need a default

BEGIN
    -- Insert into the gerrydb table first so that we fail early if
    -- the name is already taken (due to unique gerrydbtable name constraint)
    INSERT INTO gerrydbtable (created_at, uuid, name)
    VALUES (now(), gen_random_uuid(), gerrydb_table_name);

    SELECT string_agg(quote_ident(column_name), ', ')
    INTO col_list
    FROM information_schema.columns
    WHERE table_schema = 'gerrydb'
      AND table_name = parent_gerrydb_table_name
      AND data_type != 'USER-DEFINED'
      AND udt_name != 'geometry' -- on second thought, we want the geometry for some types of operations?
      AND column_name != 'ogc_fid'; -- ogr2ogr adds a primary key if one is not present

    sql_query := format('
        CREATE MATERIALIZED VIEW gerrydb.%I AS
        SELECT %L FROM gerrydb.%I
        UNION ALL
        SELECT %L
        FROM gerrydb.%I
    ', gerrydb_table_name, col_list, parent_gerrydb_table_name, col_list, child_gerrydb_table_name);

    EXECUTE sql_query;
END;
$$;
