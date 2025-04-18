CREATE OR REPLACE FUNCTION shatter_parent(
    input_document_id UUID,
    parent_geoids VARCHAR[]
)
RETURNS TABLE (
    output_document_id UUID,
    output_child_path VARCHAR,
    output_zone INTEGER
) AS $$
DECLARE
    districtr_map_uuid UUID;

BEGIN
    SELECT districtrmap.uuid INTO districtr_map_uuid
    FROM document.document
    INNER JOIN districtrmap
    ON document.districtr_map_slug = districtrmap.districtr_map_slug
    WHERE document.document_id = $1;

    IF districtr_map_uuid IS NULL THEN
        RAISE EXCEPTION 'District map uuid not found for document_id: %', input_document_id;
    END IF;

    RETURN QUERY
    WITH inserted_child_geoids AS (
        INSERT INTO document.assignments (document_id, geo_id, zone)
        SELECT $1, child_geoids.child_path, child_geoids.zone
        FROM (
            SELECT $1 as document_id, edges.child_path, a.zone
            FROM parentchildedges edges
            LEFT JOIN document.assignments a
            ON edges.parent_path = a.geo_id
                AND a.document_id = $1
            WHERE edges.parent_path = ANY(parent_geoids)
                AND edges.districtr_map = districtr_map_uuid
        ) child_geoids
        ON CONFLICT (document_id, geo_id) DO UPDATE SET zone = EXCLUDED.zone
        RETURNING geo_id, zone
    )
    SELECT
        $1 AS document_id,
        geo_id,
        zone
    FROM inserted_child_geoids;

    DELETE FROM document.assignments a
    WHERE a.document_id = $1 AND geo_id = ANY(parent_geoids);

END;
$$ LANGUAGE plpgsql;
