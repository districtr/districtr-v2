CREATE OR REPLACE FUNCTION get_block_assignments_geo(document_id UUID)
RETURNS TABLE (geo_id TEXT, zone TEXT, geometry GEOMETRY) AS $$
DECLARE
    doc_districtrmap RECORD;
    sql_query TEXT;
BEGIN
    SELECT districtrmap.* INTO doc_districtrmap
    FROM document.document
    LEFT JOIN districtrmap
    ON document.districtr_map_slug = districtrmap.districtr_map_slug
    WHERE document.document_id = $1;

    IF doc_districtrmap.districtr_map_slug IS NULL THEN
        RAISE EXCEPTION 'Table name not found for document_id: %', $1;
    END IF;

    IF doc_districtrmap.child_layer IS NULL THEN
        RAISE EXCEPTION 'Child layer is NULL for document_id: %. Block-level exports are not supported', $1;
    ELSE
        sql_query := format('
            SELECT
                assignments.*,
                blocks.geometry
            FROM get_block_assignments($1::UUID) assignments
            LEFT JOIN gerrydb.%I blocks
            ON blocks.path = assignments.geo_id
        ', doc_districtrmap.child_layer);
    END IF;

    RETURN QUERY EXECUTE sql_query USING $1;
END;
$$ LANGUAGE plpgsql;
