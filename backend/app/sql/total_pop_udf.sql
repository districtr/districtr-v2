CREATE OR REPLACE FUNCTION get_total_population(document_id UUID)
RETURNS TABLE (zone TEXT, total_pop BIGINT) AS $$
DECLARE
    gerrydb_table_name TEXT;
    sql_query TEXT;
BEGIN
    SELECT gerrydb_table INTO gerrydb_table_name
    FROM document
    WHERE document.document_id = $1;
    sql_query := format('
        SELECT
            assignments.zone::TEXT AS zone,
            SUM(COALESCE(blocks.total_pop, 0))::BIGINT AS total_pop
        FROM assignments
        LEFT JOIN gerrydb.%I blocks
        ON blocks.path = assignments.geo_id
        WHERE assignments.document_id = $1
        GROUP BY assignments.zone
    ', gerrydb_table_name);
    RETURN QUERY EXECUTE sql_query USING $1;
END;
$$ LANGUAGE plpgsql;
