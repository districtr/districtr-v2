CREATE OR REPLACE FUNCTION get_zone_assignments_geo(document_id UUID)
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
        sql_query := format('
            SELECT
                assignments.geo_id::TEXT AS geo_id,
                assignments.zone::TEXT AS zone,
                blocks.geometry AS geometry
            FROM document.assignments
            LEFT JOIN gerrydb.%I blocks
            ON blocks.path = assignments.geo_id
            WHERE assignments.document_id = $1
        ', doc_districtrmap.parent_layer);
    ELSE
        sql_query := format('
            SELECT
                assignments.geo_id::TEXT AS geo_id,
                assignments.zone::TEXT AS zone,
                parents.geometry AS geometry
            FROM document.assignments
            INNER JOIN gerrydb.%I parents
            ON parents.path = assignments.geo_id
            WHERE assignments.document_id = $1
            UNION ALL
            SELECT
                assignments.geo_id::TEXT,
                assignments.zone::TEXT,
                children.geometry
            FROM document.assignments
            INNER JOIN gerrydb.%I children
            ON children.path = assignments.geo_id
            WHERE assignments.document_id = $1
        ', doc_districtrmap.parent_layer, doc_districtrmap.child_layer);
    END IF;

    RETURN QUERY EXECUTE sql_query USING $1;
END;
$$ LANGUAGE plpgsql;
