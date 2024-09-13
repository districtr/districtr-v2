CREATE OR REPLACE FUNCTION create_districtr_map(
    map_name VARCHAR,
    gerrydb_table_name VARCHAR,
    num_districts INTEGER,
    tiles_s3_path VARCHAR,
    parent_layer_name VARCHAR,
    child_layer_name VARCHAR
)
RETURNS UUID AS $$
DECLARE
    parent_layer_uuid UUID;
    child_layer_uuid UUID;
    map_uuid UUID;
BEGIN
    SELECT uuid INTO parent_layer_uuid
    FROM gerrydbtable
    WHERE name = parent_layer_name;

    IF parent_layer_uuid IS NULL THEN
        RAISE EXCEPTION 'Parent layer not found: %', parent_layer_name;
    END IF;

    SELECT uuid INTO child_layer_uuid
    FROM gerrydbtable
    WHERE name = child_layer_name;

    IF child_layer_uuid IS NULL THEN
        RAISE NOTICE 'Child layer not specified: %. If creating a shatterable map, child layer is required', child_layer_name;
    END IF;

    INSERT INTO districtrmap (
        created_at,
        uuid,
        name,
        gerrydb_table_name,
        num_districts,
        tiles_s3_path,
        parent_layer,
        child_layer
    )
    VALUES (
        now(),
        gen_random_uuid(),
        map_name,
        gerrydb_table_name,
        num_districts,
        tiles_s3_path,
        parent_layer_uuid,
        child_layer_uuid
    )
    RETURNING uuid INTO map_uuid;
    RETURN map_uuid;
END;
$$ LANGUAGE plpgsql;
