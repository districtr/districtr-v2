DROP FUNCTION IF EXISTS get_summary_stats_p4(uuid);

CREATE FUNCTION get_summary_stats_p4(document_id UUID)
RETURNS TABLE (
    zone TEXT,
    hispanic_vap BIGINT,
    non_hispanic_asian_vap BIGINT,
    non_hispanic_amin_vap BIGINT,
    non_hispanic_nhpi_vap BIGINT,
    non_hispanic_black_vap BIGINT,
    non_hispanic_white_vap BIGINT,
    non_hispanic_other_vap BIGINT,
    non_hispanic_two_or_more_races_vap BIGINT
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
            SUM(COALESCE(blocks.hispanic_vap, 0))::BIGINT AS hispanic_vap,
            SUM(COALESCE(blocks.non_hispanic_asian_vap, 0))::BIGINT AS non_hispanic_asian_vap,
            SUM(COALESCE(blocks.non_hispanic_amin_vap, 0))::BIGINT AS non_hispanic_amin_vap,
            SUM(COALESCE(blocks.non_hispanic_nhpi_vap, 0))::BIGINT AS non_hispanic_nhpi_vap,
            SUM(COALESCE(blocks.non_hispanic_black_vap, 0))::BIGINT AS non_hispanic_black_vap,
            SUM(COALESCE(blocks.non_hispanic_white_vap, 0))::BIGINT AS non_hispanic_white_vap,
            SUM(COALESCE(blocks.non_hispanic_other_vap, 0))::BIGINT AS non_hispanic_other_vap,
            SUM(COALESCE(blocks.non_hispanic_two_or_more_races_vap, 0))::BIGINT AS non_hispanic_two_or_more_races_vap
        FROM document.assignments
        LEFT JOIN gerrydb.%I blocks
        ON blocks.path = assignments.geo_id
        WHERE assignments.document_id = $1
        GROUP BY assignments.zone
    ', doc_districtrmap.gerrydb_table_name);
    RETURN QUERY EXECUTE sql_query USING $1;
END;
$$ LANGUAGE plpgsql;
