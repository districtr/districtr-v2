DROP FUNCTION IF EXISTS get_summary_p1_totals(TEXT);

CREATE FUNCTION get_summary_p1_totals(gerrydb_table TEXT)
RETURNS TABLE (
    other_pop BIGINT,
    asian_pop BIGINT,
    amin_pop BIGINT,
    nhpi_pop BIGINT,
    black_pop BIGINT,
    white_pop BIGINT,
    two_or_more_races_pop BIGINT,
    total_pop BIGINT
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
            SUM(COALESCE(other_pop, 0))::BIGINT AS other_pop,
            SUM(COALESCE(asian_pop, 0))::BIGINT AS asian_pop,
            SUM(COALESCE(amin_pop, 0))::BIGINT AS amin_pop,
            SUM(COALESCE(nhpi_pop, 0))::BIGINT AS nhpi_pop,
            SUM(COALESCE(black_pop, 0))::BIGINT AS black_pop,
            SUM(COALESCE(white_pop, 0))::BIGINT AS white_pop,
            SUM(COALESCE(two_or_more_races_pop, 0))::BIGINT AS two_or_more_races_pop,
            SUM(COALESCE(total_pop, 0))::BIGINT AS total_pop
        FROM gerrydb.%I
    ', $1);
    RETURN QUERY EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql;
