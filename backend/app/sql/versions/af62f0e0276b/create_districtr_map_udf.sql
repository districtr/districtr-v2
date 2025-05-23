CREATE OR REPLACE FUNCTION create_districtr_map(
    map_name VARCHAR,
    districtr_map_slug VARCHAR,
    gerrydb_table_name VARCHAR,
    num_districts INTEGER,
    tiles_s3_path VARCHAR,
    parent_layer_name VARCHAR,
    child_layer_name VARCHAR,
    visibility BOOLEAN DEFAULT TRUE,
    map_type VARCHAR DEFAULT 'default'
)
RETURNS UUID AS $$
DECLARE
    inserted_districtr_uuid UUID;
BEGIN
    INSERT INTO districtrmap (
        created_at,
        uuid,
        name,
        districtr_map_slug,
        gerrydb_table_name,
        num_districts,
        tiles_s3_path,
        parent_layer,
        child_layer,
        visible,
        map_type
    )
    VALUES (
        now(),
        gen_random_uuid(),
        map_name,
        districtr_map_slug,
        gerrydb_table_name,
        num_districts,
        tiles_s3_path,
        parent_layer_name,
        child_layer_name,
        visibility,
        map_type::maptype
    )
    RETURNING uuid INTO inserted_districtr_uuid;

    RETURN inserted_districtr_uuid;
END;
$$ LANGUAGE plpgsql;
