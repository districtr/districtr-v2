CREATE OR REPLACE FUNCTION get_block_assignments(document_id UUID, zones INTEGER[])
RETURNS TABLE (geo_id TEXT, zone INTEGER) AS $$
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
        RAISE EXCEPTION 'Child layer is NULL for document_id: %. Block-level queries are not supported', $1;
    ELSE
        sql_query := format('
            SELECT
                edges.child_path::TEXT AS geo_id,
                COALESCE(a1.zone, a2.zone) AS zone
            FROM "parentchildedges_%s" edges
            LEFT JOIN document.assignments a1
                ON a1.geo_id = edges.parent_path
                AND a1.document_id = $1
                AND a1.zone = ANY($2)
            LEFT JOIN document.assignments a2
                ON a2.geo_id = edges.child_path
                AND a2.document_id = $1
                AND a2.zone = ANY($2)
        ', doc_districtrmap.uuid);
    END IF;

    RETURN QUERY EXECUTE sql_query USING $1, $2;
END;
$$ LANGUAGE plpgsql;
