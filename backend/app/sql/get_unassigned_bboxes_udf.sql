DROP FUNCTION IF EXISTS get_unassigned_bboxes(doc_uuid uuid, exclude_ids VARCHAR[]);
CREATE OR REPLACE FUNCTION get_unassigned_bboxes(doc_uuid uuid, exclude_ids VARCHAR[])
RETURNS TABLE (bbox json) AS $$
DECLARE
  gerrydb_table text;
  parent_layer text;
  child_layer text;
BEGIN
  -- Get the table information from the document
  SELECT dm.gerrydb_table_name, dm.parent_layer, dm.child_layer
  INTO gerrydb_table, parent_layer, child_layer
  FROM document.document d
  JOIN public.districtrmap dm ON d.gerrydb_table = dm.gerrydb_table_name
  WHERE d.document_id = doc_uuid;

  RETURN QUERY EXECUTE format(
    'SELECT ST_AsGeoJSON(
      ST_Dump(
        ST_Transform(
          ST_Union(
            ST_Envelope(
              %s
            )
          ),
          4326
        )
      )
    )::json as bbox
    FROM (
      SELECT DISTINCT geo_id
      FROM document.assignments
      WHERE document_id = $1
      UNION
      SELECT path as geo_id
      FROM gerrydb.%I
    ) ids
    LEFT JOIN document.assignments doc
      ON ids.geo_id = doc.geo_id
      AND doc.document_id = $1
    LEFT JOIN gerrydb.%I parentgeo
      ON ids.geo_id = parentgeo.path
    %s
    WHERE doc.zone IS NULL
    AND doc.geo_id NOT IN (SELECT unnest($2))',
    CASE 
      WHEN child_layer IS NOT NULL THEN 'COALESCE(parentgeo.geometry, childgeo.geometry)'
      ELSE 'parentgeo.geometry'
    END,
    parent_layer,
    parent_layer,
    CASE 
      WHEN child_layer IS NOT NULL THEN format('LEFT JOIN gerrydb.%I childgeo ON ids.geo_id = childgeo.path', child_layer)
      ELSE ''
    END
  ) USING doc_uuid, exclude_ids;
END;
$$ LANGUAGE plpgsql;