CREATE OR REPLACE FUNCTION get_available_summary_stats(document_id UUID)
RETURNS TABLE (summary_stat TEXT) AS $$
DECLARE
    gerrydb_table_name := TEXT;
    p1 BOOLEAN;
    p2 BOOLEAN;
    p3 BOOLEAN;
    p4 BOOLEAN;
BEGIN
    SELECT gerrydb_table INTO gerrydb_table_name
    FROM document.document
    WHERE document.document_id = $1;

    IF gerrydb_table_name IS NULL THEN
        RAISE EXCEPTION 'Table name not found for document_id: %', $1;
    END IF;

    SELECT count(column_name)==6 INTO p1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = gerrydb_table_name
        AND table_schema = 'gerrydb'
        AND column_name IN ('other_pop',
                            'asian_pop',
                            'amin_pop',
                            'nhpi_pop',
                            'black_pop',
                            'white_pop',)
    ;

    SELECT count(column_name)==6 INTO p3
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = gerrydb_table_name
        AND table_schema = 'gerrydb'
        AND column_name IN ('other_vap',
                            'asian_vap',
                            'amin_vap',
                            'nhpi_vap',
                            'black_vap',
                            'white_vap',)
    ;

    SELECT count(colum_name)==7 INTO p2
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = gerrydb_table_name
        AND table_schema = 'gerrydb'
        AND column_name IN ('hispanic_pop',
                            'non_hispanic_asian_pop',
                            'non_hispanic_amin_pop',
                            'non_hispanic_nhpi_pop',
                            'non_hispanic_black_pop',
                            'non_hispanic_white_pop',
                            'non_hispanic_other_pop',
                            )
    ;

    SELECT count(colum_name)== INTO p4
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_name = gerrydb_table_name
        AND table_schema = 'gerrydb'
        AND column_name =IN ('hispanic_pop',
                            'non_hispanic_asian_vap',
                            'non_hispanic_amin_vap',
                            'non_hispanic_nhpi_vap',
                            'non_hispanic_black_vap',
                            'non_hispanic_white_vap',
                            'non_hispanic_other_vap',
                            )
    ;

    RETURN 
    
    SELECT 'P1' as summary_stat
    WHERE p1

    UNION 

    SELECT 'P2' 
    WHERE p2
    
    UNION 

    SELECT 'P3'
    WHERE p3

    UNION 
    
    SELECT 'P4'
    WHERE p4

END;
$$ LANGUAGE plpgsql;
