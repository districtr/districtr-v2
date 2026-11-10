DROP FUNCTION IF EXISTS unshatter_parent; --If DB has an old version with old types
CREATE FUNCTION unshatter_parent(
    input_document_id UUID,
    parent_geoids VARCHAR[],
    input_zone INTEGER
) RETURNS VARCHAR[]
AS $$
DECLARE
    districtr_map_uuid UUID;
	returned_geoids VARCHAR[];  -- Declare a variable to hold the returned geoids


BEGIN
    SELECT districtrmap.uuid INTO districtr_map_uuid
    FROM document.document
    INNER JOIN districtrmap
    ON document.gerrydb_table = districtrmap.gerrydb_table_name
    WHERE document.document_id = input_document_id;

    IF districtr_map_uuid IS NULL THEN
        RAISE EXCEPTION 'District map uuid not found for document_id: %', input_document_id;
    END IF;

    -- Remove all children associated with the parent geoids after joining to edges
    DELETE FROM document.assignments
    WHERE document_id = input_document_id
    AND geo_id IN (
		SELECT a.geo_id
		FROM document.assignments a
		LEFT JOIN parentchildedges e
		ON a.geo_id = e.child_path
		WHERE a.document_id = input_document_id
		AND e.parent_path = ANY(parent_geoids)
		AND e.districtr_map = districtr_map_uuid
    );

    -- Insert the unshattered parent into the assignments table with the designated zone
    INSERT INTO document.assignments (document_id, geo_id, zone)
    SELECT input_document_id, unnest(parent_geoids), input_zone  -- Insert all parent geoids
    ON CONFLICT (document_id, geo_id) DO UPDATE SET zone = EXCLUDED.zone;

    RETURN parent_geoids;  -- Return the geoids
END;
$$ LANGUAGE plpgsql;
