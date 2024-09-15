/*
TODO: Should add additional validations
- Check that in the result set all parents are present once and only once
- Check that in the result set all children are present once
*/

CREATE OR REPLACE PROCEDURE add_parent_child_relationships(
    districtr_map_uuid UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    previously_loaded BOOLEAN;
    districtr_map RECORD;

BEGIN
    SELECT uuid, parent_layer, child_layer INTO districtr_map
    FROM districtrmap
    WHERE uuid = districtr_map_uuid;

    IF districtr_map IS NULL THEN
        RAISE EXCEPTION 'No districtrmap found for: %', districtr_map_uuid;
    END IF;

    SELECT COUNT(*) > 0 INTO previously_loaded
    FROM parentchildedges edges
    WHERE edges.districtr_map = districtr_map.uuid;

    IF previously_loaded THEN
        RAISE EXCEPTION 'Relationships for districtr_map % already loaded', districtr_map_uuid;
    END IF;

    EXECUTE format('
        INSERT INTO parentchildedges (created_at, districtr_map, parent_path, child_path)
        SELECT
            now() AS created_at,
            $1 as districtr_map,
            parent.path as parent_path,
            child.path as child_path
        FROM
            gerrydb.%I AS parent
        JOIN
            gerrydb.%I AS child
        ON -- NOTE: All geometry column aliases must be geometry. This should be enforced on load.
            ST_Contains(parent.geometry, ST_PointOnSurface(child.geometry))
    ', districtr_map.parent_layer, districtr_map.child_layer)
    USING districtr_map.uuid;

END;
$$;
