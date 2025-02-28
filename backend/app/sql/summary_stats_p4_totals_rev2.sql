DROP FUNCTION IF EXISTS get_summary_p4_totals(TEXT);

CREATE FUNCTION get_summary_p4_totals(gerrydb_table TEXT)
RETURNS TABLE (
    hispanic_vap BIGINT,
    non_hispanic_asian_vap BIGINT,
    non_hispanic_amin_vap BIGINT,
    non_hispanic_nhpi_vap BIGINT,
    non_hispanic_black_vap BIGINT,
    non_hispanic_white_vap BIGINT,
    non_hispanic_other_vap BIGINT,
    non_hispanic_two_or_more_races_vap BIGINT,
    total_vap BIGINT
) AS $$
DECLARE
    table_exists BOOLEAN;
    sql_query TEXT;

BEGIN
    -- Check if the table exists
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'gerrydb'
        AND table_name = $1
    ) INTO table_exists;

    IF NOT table_exists THEN
        RAISE EXCEPTION 'Table % does not exist in gerrydb schema', $1;
    END IF;

    sql_query := format('
        SELECT
        SUM(COALESCE(hispanic_vap, 0))::BIGINT AS hispanic_vap,
        SUM(COALESCE(non_hispanic_asian_vap, 0))::BIGINT AS non_hispanic_asian_vap,
        SUM(COALESCE(non_hispanic_amin_vap, 0))::BIGINT AS non_hispanic_amin_vap,
        SUM(COALESCE(non_hispanic_nhpi_vap, 0))::BIGINT AS non_hispanic_nhpi_vap,
        SUM(COALESCE(non_hispanic_black_vap, 0))::BIGINT AS non_hispanic_black_vap,
        SUM(COALESCE(non_hispanic_white_vap, 0))::BIGINT AS non_hispanic_white_vap,
        SUM(COALESCE(non_hispanic_other_vap, 0))::BIGINT AS non_hispanic_other_vap,
        SUM(COALESCE(non_hispanic_two_or_more_races_vap, 0))::BIGINT AS non_hispanic_two_or_more_races_vap,
        SUM(COALESCE(total_vap, 0))::BIGINT AS total_vap
        FROM gerrydb.%I
    ', $1);
    RETURN QUERY EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql;
