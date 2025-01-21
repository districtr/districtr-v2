CREATE OR REPLACE PROCEDURE create_zone_assignments_geo_view(document_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
    doc_districtrmap RECORD;
    sql_query TEXT;
BEGIN
    SELECT districtrmap.* INTO doc_districtrmap
    FROM document.document
    LEFT JOIN districtrmap
    ON document.gerrydb_table = districtrmap.gerrydb_table_name
    WHERE document.document_id = $1;

    IF doc_districtrmap.gerrydb_table_name IS NULL THEN
        RAISE EXCEPTION 'Table name not found for document_id: %', $1;
    END IF;

    IF doc_districtrmap.child_layer IS NULL THEN
        sql_query := format('
            CREATE OR REPLACE VIEW "document.%s_geo" AS
            SELECT
                assignments.geo_id::TEXT AS geo_id,
                assignments.zone::TEXT AS zone,
                blocks.geometry AS geometry
            FROM document.assignments
            LEFT JOIN gerrydb.%I blocks
            ON blocks.path = assignments.geo_id
            WHERE assignments.document_id = %L
        ', $1, doc_districtrmap.parent_layer, $1);
    ELSE
        sql_query := format('
            CREATE OR REPLACE VIEW "document.%s_geo" AS
            SELECT
                assignments.geo_id::TEXT AS geo_id,
                assignments.zone::TEXT AS zone,
                parents.geometry AS geometry
            FROM document.assignments
            INNER JOIN gerrydb.%I parents
            ON parents.path = assignments.geo_id
            WHERE assignments.document_id = %L
            UNION ALL
            SELECT
                assignments.geo_id::TEXT,
                assignments.zone::TEXT,
                children.geometry
            FROM document.assignments
            INNER JOIN gerrydb.%I children
            ON children.path = assignments.geo_id
            WHERE assignments.document_id = %L
        ', $1, doc_districtrmap.parent_layer, $1, doc_districtrmap.child_layer, $1);
    END IF;

    EXECUTE sql_query USING $1;
END;
$$;
