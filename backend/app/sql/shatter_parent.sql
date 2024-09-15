CREATE OR REPLACE FUNCTION shatter_parent(
    input_document_id UUID,
    parent_geoids VARCHAR[]
)
RETURNS TABLE (document_id UUID, child_path TEXT, zone TEXT) AS $$
DECLARE
    districtr_map_uuid UUID;

BEGIN
    SELECT districtrmap.uuid INTO districtr_map_uuid
    FROM document.document
    INNER JOIN districtrmap
    ON document.gerrydb_table = districtrmap.gerrydb_table_name
    WHERE document.document_id = $1;

    IF districtr_map_uuid IS NULL THEN
        RAISE EXCEPTION 'District map uuid not found for document_id: %', input_document_id;
    END IF;

    INSERT INTO document.assignments (document_id, geo_id, zone)
    SELECT $1, child_geoids.child_path, child_geoids.zone
    FROM (
        SELECT edges.child_path, a.zone
        FROM document.assignments a
        INNER JOIN parentchildedges edges
        ON edges.parent_path = a.geo_id
        WHERE a.document_id = $1
            AND a.geo_id = ANY(parent_geoids)
            AND edges.districtr_map = districtr_map_uuid
    ) child_geoids
    ON CONFLICT (document_id, geo_id) DO UPDATE SET zone = EXCLUDED.zone;

    -- Need to delete the parents after we've inserted the children
    -- since we use the parent existing zones to determine the child zones.
    DELETE FROM document.assignments a
    WHERE a.document_id = $1 AND geo_id = ANY(parent_geoids);

    -- Is there a way to return the child_geoids CTE from the INSERT INTO statement
    -- so that we don't have to do this SELECT statement?
    RETURN QUERY
    SELECT $1 AS document_id, geo_id, zone FROM document.assignments a
    WHERE a.document_id = $1 AND geo_id IN (
        SELECT edges.child_path
        FROM parentchildedges edges
        WHERE edges.districtr_map = districtr_map_uuid
        AND edges.parent_path = ANY(parent_geoids)
    );
END;
$$ LANGUAGE plpgsql;
