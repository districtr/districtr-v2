DROP FUNCTION IF EXISTS get_summary_stats_p1(uuid);

CREATE FUNCTION get_summary_stats_p1(document_id UUID)
RETURNS TABLE (
    zone TEXT,
    other_pop BIGINT,
    asian_pop BIGINT,
    amin_pop BIGINT,
    nhpi_pop BIGINT,
    black_pop BIGINT,
    white_pop BIGINT,
    two_or_more_races_pop BIGINT
) AS $$
DECLARE
    doc_districtrmap RECORD;
    sql_query TEXT;
BEGIN
    SELECT districtrmap.* INTO doc_districtrmap
    FROM document.document
    LEFT JOIN districtrmap
    ON document.districtr_map_slug = districtrmap.districtr_map_slug
    WHERE document.document_id = $1;

    IF doc_districtrmap.gerrydb_table_name IS NULL THEN
        RAISE EXCEPTION 'Table name not found for document_id: %', $1;
    END IF;

    sql_query := format('
        SELECT
            assignments.zone::TEXT AS zone,
            SUM(COALESCE(blocks.other_pop, 0))::BIGINT AS other_pop,
            SUM(COALESCE(blocks.asian_pop, 0))::BIGINT AS asian_pop,
            SUM(COALESCE(blocks.amin_pop, 0))::BIGINT AS amin_pop,
            SUM(COALESCE(blocks.nhpi_pop, 0))::BIGINT AS nhpi_pop,
            SUM(COALESCE(blocks.black_pop, 0))::BIGINT AS black_pop,
            SUM(COALESCE(blocks.white_pop, 0))::BIGINT AS white_pop,
            SUM(COALESCE(blocks.two_or_more_races_pop, 0))::BIGINT AS two_or_more_races_pop
        FROM document.assignments
        LEFT JOIN gerrydb.%I blocks
        ON blocks.path = assignments.geo_id
        WHERE assignments.document_id = $1
        GROUP BY assignments.zone
    ', doc_districtrmap.gerrydb_table_name);
    RETURN QUERY EXECUTE sql_query USING $1;
END;
$$ LANGUAGE plpgsql;
