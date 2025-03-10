DROP FUNCTION IF EXISTS get_available_summary_stats(TEXT);
CREATE OR REPLACE FUNCTION get_available_summary_stats(gerrydb_table_name TEXT)
RETURNS TABLE (summary_stat TEXT) AS $$
DECLARE
    TOTPOP BOOLEAN;
    VAP BOOLEAN;
    VHISTORy BOOLEAN;
BEGIN
    SELECT count(column_name) = 7 INTO TOTPOP
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = gerrydb_table_name
        AND table_schema = 'gerrydb'
        AND column_name IN (
          'white_pop_20',
          'other_pop_20',
          'amin_pop_20',
          'asian_nhpi_pop_20',
          'hpop_20',
          'bpop_20',
          'total_pop_20'
        )
    ;

    SELECT count(column_name) = 7 INTO VAP
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = gerrydb_table_name
        AND table_schema = 'gerrydb'
        AND column_name IN (
          'white_vap_20',
          'other_vap_20',
          'amin_vap_20',
          'asian_nhpi_vap_20',
          'hvap_20',
          'bvap_20',
          'total_vap_20'
        )
    ;

    SELECT count(column_name) = 18 INTO VHISTORY
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = gerrydb_table_name
        AND table_schema = 'gerrydb'
        AND column_name IN (
          'ag_22_rep',
          'ag_22_dem',
          'ag_18_rep',
          'ag_18_dem',
          'gov_22_rep',
          'gov_22_dem',
          'gov_18_rep',
          'gov_18_dem',
          'sen_22_rep',
          'sen_22_dem',
          'sen_18_rep',
          'sen_18_dem',
          'sen_16_rep',
          'sen_16_dem',
          'pres_20_rep',
          'pres_20_dem',
          'pres_16_rep',
          'pres_16_dem'
        )
    ;

    RETURN QUERY

    SELECT 'TOTPOP' as summary_stat
    WHERE TOTPOP

    UNION

    SELECT 'VAP'
    WHERE VAP

    UNION

    SELECT 'VHISTORY'
    WHERE VHISTORY;
END;
$$ LANGUAGE plpgsql;
