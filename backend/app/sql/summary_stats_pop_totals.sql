CREATE OR REPLACE FUNCTION get_summary_stats_pop_totals(document_id UUID)
RETURNS TABLE (
    zone TEXT,
    other_pop BIGINT,
    asian_pop BIGINT,
    amin_pop BIGINT,
    nhpi_pop BIGINT,
    black_pop BIGINT,
    white_pop BIGINT
) AS $$
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

    sql_query := format('
        SELECT
            SUM(COALESCE(other_pop, 0))::BIGINT AS other_pop,
            SUM(COALESCE(asian_pop, 0))::BIGINT AS asian_pop,
            SUM(COALESCE(amin_pop, 0))::BIGINT AS amin_pop,
            SUM(COALESCE(nhpi_pop, 0))::BIGINT AS nhpi_pop,
            SUM(COALESCE(black_pop, 0))::BIGINT AS black_pop,
            SUM(COALESCE(white_pop, 0))::BIGINT AS white_pop
        FROM gerrydb.%I
    ', doc_districtrmap.parent_layer);
    RETURN QUERY EXECUTE sql_query USING $1;
END;
$$ LANGUAGE plpgsql;
