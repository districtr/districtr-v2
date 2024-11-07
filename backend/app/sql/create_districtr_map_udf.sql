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
    inserted_districtr_uuid UUID;
    extent GEOMETRY;
BEGIN
    EXECUTE format('
        SELECT ST_Extent(ST_Transform(geometry, 4326))
        FROM gerrydb.%I',
        parent_layer_name
    ) INTO extent;

    INSERT INTO districtrmap (
        created_at,
        uuid,
        name,
        gerrydb_table_name,
        num_districts,
        tiles_s3_path,
        parent_layer,
        child_layer,
        extent
    )
    VALUES (
        now(),
        gen_random_uuid(),
        map_name,
        gerrydb_table_name,
        num_districts,
        tiles_s3_path,
        parent_layer_name,
        child_layer_name,
        ARRAY[
            ST_XMin(extent),
            ST_YMin(extent),
            ST_XMax(extent),
            ST_YMax(extent)
        ]
    )
    RETURNING uuid INTO inserted_districtr_uuid;

    RETURN inserted_districtr_uuid;
END;
$$ LANGUAGE plpgsql;
