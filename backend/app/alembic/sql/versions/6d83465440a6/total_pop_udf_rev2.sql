CREATE OR REPLACE FUNCTION get_total_population(document_id UUID)
RETURNS TABLE (zone TEXT, total_pop BIGINT) AS $$
DECLARE
    doc_districtrmap RECORD;
    sql_query TEXT;
    total_pop_column_name TEXT;
BEGIN
    SELECT districtrmap.* INTO doc_districtrmap
    FROM document.document
    LEFT JOIN districtrmap
    ON document.gerrydb_table = districtrmap.gerrydb_table_name
    WHERE document.document_id = $1;

    IF doc_districtrmap.gerrydb_table_name IS NULL THEN
        RAISE EXCEPTION 'Table name not found for document_id: %', $1;
    END IF;

    SELECT column_name INTO total_pop_column_name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = doc_districtrmap.parent_layer
        AND table_schema = 'gerrydb'
        AND column_name IN ('total_pop_20')
    ORDER BY column_name ASC
    LIMIT 1;

    IF total_pop_column_name IS NULL THEN
        RAISE EXCEPTION 'Population column not found for gerrydbview %', doc_districtrmap.gerrydb_table_name;
    END IF;

    sql_query := format('
        SELECT
            assignments.zone::TEXT AS zone,
            SUM(COALESCE(blocks.%I, 0))::BIGINT AS total_pop
        FROM document.assignments
        LEFT JOIN gerrydb.%I blocks
        ON blocks.path = assignments.geo_id
        WHERE assignments.document_id = $1
        GROUP BY assignments.zone
    ', total_pop_column_name, doc_districtrmap.gerrydb_table_name);
    RETURN QUERY EXECUTE sql_query USING $1;
END;
$$ LANGUAGE plpgsql;
