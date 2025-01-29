DROP FUNCTION IF EXISTS get_unassigned_bboxes(doc_uuid uuid, exclude_ids VARCHAR[]);
CREATE OR REPLACE FUNCTION get_unassigned_bboxes(doc_uuid uuid, exclude_ids VARCHAR[])
RETURNS TABLE (bbox json) AS $$
DECLARE
  gerrydb_table text;
  parent_layer text;
  child_layer text;
  dm_uuid uuid;
BEGIN
  -- Get the table information from the document
  SELECT dm.gerrydb_table_name, dm.parent_layer, dm.child_layer, dm.uuid
  INTO gerrydb_table, parent_layer, child_layer, dm_uuid
  FROM document.document d
  JOIN public.districtrmap dm ON d.gerrydb_table = dm.gerrydb_table_name
  WHERE d.document_id = doc_uuid;
    
  RETURN QUERY EXECUTE format(
    -- IDS as CTE instead of subquery
    'WITH ids AS (
      SELECT DISTINCT geo_id
      FROM document.assignments
      WHERE document_id = $1
      UNION
      SELECT path as geo_id
      FROM gerrydb.%I
    )
    SELECT ST_AsGeoJSON(
      -- Explode multipolygon into individual polygons
      ST_Dump(
        -- To web projection
        ST_Transform(
          -- Union the envelopes into a single contiguous bbox
          ST_Union(
            ST_Envelope(
            -- See 92-95 - coalesce parentgeo.geometry with childgeo.geometry depending on which type of geo
              %s
            )
          ),
          4326
        )
      )
    )::json as bbox
    FROM ids
    LEFT JOIN document.assignments doc
      ON ids.geo_id = doc.geo_id
      AND doc.document_id = $1
    -- Parent layer again
    LEFT JOIN gerrydb.%I parentgeo
      ON ids.geo_id = parentgeo.path
    -- If child layer is specified, join with child layer geometries
    %s
    WHERE doc.zone IS NULL
    -- Exclude broken parents
  AND doc.geo_id NOT IN (
    SELECT DISTINCT edges.parent_path
    FROM public."parentchildedges_%s" edges
    INNER JOIN ids
    ON ids.geo_id = edges.child_path
  )
  ',
    parent_layer,
    CASE 
      WHEN child_layer IS NOT NULL THEN 'COALESCE(parentgeo.geometry, childgeo.geometry)'
      ELSE 'parentgeo.geometry'
    END,
    parent_layer,
    CASE 
      WHEN child_layer IS NOT NULL THEN format('LEFT JOIN gerrydb.%I childgeo ON ids.geo_id = childgeo.path', child_layer)
      ELSE ''
    END,
    dm_uuid
  ) USING doc_uuid, exclude_ids;
END;
$$ LANGUAGE plpgsql;