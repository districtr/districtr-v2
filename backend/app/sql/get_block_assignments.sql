CREATE OR REPLACE FUNCTION get_block_assignments(document_id UUID)
RETURNS TABLE (geo_id TEXT, zone TEXT) AS $$
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
        RAISE EXCEPTION 'Child layer is NULL for document_id: %. Block-level exports are not supported', $1;
    ELSE
        sql_query := format('
            SELECT
                edges.child_path::TEXT AS geo_id,
                assignments.zone::TEXT AS zone
            FROM "parentchildedges_%s" edges
            LEFT JOIN document.assignments assignments
            ON (
                assignments.geo_id = edges.parent_path OR assignments.geo_id = edges.child_path
            ) AND assignments.document_id = $1
        ', doc_districtrmap.uuid);
    END IF;

    RETURN QUERY EXECUTE sql_query USING $1;
END;
$$ LANGUAGE plpgsql;
