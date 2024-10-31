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
BEGIN
    INSERT INTO districtrmap (
        created_at,
        uuid,
        name,
        gerrydb_table_name,
        num_districts,
        tiles_s3_path,
        parent_layer,
        child_layer,
        -- calculate extent based on parent_layer extent 
        select(
            ARRAY[
                ST_XMin(ST_Extent(ST_Transform(geometry, 4326))),
                ST_YMin(ST_Extent(ST_Transform(geometry, 4326))),
                ST_XMax(ST_Extent(ST_Transform(geometry, 4326))),
                ST_YMax(ST_Extent(ST_Transform(geometry, 4326)))
            ]
            FROM gerrydb.$5, public.districtrmap
            WHERE districtrmap.parent_layer = $5
        )
    )
    VALUES (now(), gen_random_uuid(), $1, $2, $3, $4, $5, $6)
    RETURNING uuid INTO inserted_districtr_uuid;
    RETURN inserted_districtr_uuid;
END;
$$ LANGUAGE plpgsql;