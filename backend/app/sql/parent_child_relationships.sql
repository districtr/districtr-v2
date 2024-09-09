/*
TODO: Should add additional validations
- Check that in the result set all parents are present once and only once
- Check that in the result set all children are present once
*/

CREATE OR REPLACE PROCEDURE add_parent_child_relationships(
    districtr_map_uuid UUID,
    parent_layer TEXT,
    child_layer TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    previously_loaded BOOLEAN;

BEGIN
    SELECT COUNT(*) > 0 INTO previously_loaded
    FROM parentchildedges
    WHERE districtr_map = districtr_map_uuid;

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
        ON
            ST_Contains(parent.geography, ST_PointOnSurface(child.geography))
    ', parent_layer, child_layer)
    USING districtr_map_uuid;

END;
$$;
