-- FUNCTION: get_unassigned_bboxes(doc_uuid uuid, exclude_ids VARCHAR[])
-- RETURNS: TABLE (bbox json)
-- LANGUAGE: plpgsql
--
-- DESCRIPTION:
-- This function retrieves the bounding boxes (bboxes) of unassigned geometries
-- from a specified document, excluding certain geometries based on provided IDs.
-- The specified IDs represent the broken parent geometries, which we want to exlcude.
-- The function assumes that when breaking a geometry, ALL child geometries are assigned (or null).
-- The reason for providing this parameter from the frontend is to avoid running a query
-- that requires the full materialized view of the document !!AND!! the parent child edges
-- to identify which parents are broken and which children are expected to be assigned.
-- Important! The alternative version of this function (See ALT_get_unassgigned_bbox_udf.sql)
-- does NOT require user-supplied broken parents, but is slower.
--
-- PARAMETERS:
-- - doc_uuid (uuid): The unique identifier of the document.
-- - exclude_ids (VARCHAR[]): An array of parent geometries that are broken and should be excluded.
--
-- RETURNS:
-- - TABLE (bbox json): A table containing the bounding boxes of unassigned geometries in JSON format.
--
-- DECLARE VARIABLES:
-- - gerrydb_table (text): The name of the table in the gerrydb schema.
-- - parent_layer (text): The name of the parent layer in the gerrydb schema.
-- - child_layer (text): The name of the child layer in the gerrydb schema (if any).
--
-- LOGIC:
-- 1. Retrieve the table information (gerrydb_table, parent_layer, child_layer) from the document
--    using the provided document UUID.
-- 2. Construct and execute a dynamic SQL query to:
--    a. Select all the GEOIDs we expect to have assigned in a "compplete" plan, given the application state
--    b. Join these geo_ids with the document assignments and gerrydb parent layer geometries.
--    c. Optionally join with the gerrydb child layer geometries if a child layer is specified.
--    d. Filter out geometries that are assigned (zone is not NULL) or are in the exclude_ids list.
--    e. Compute the bounding boxes (bboxes) of the remaining unassigned geometries.
-- 3. Return the resulting bounding boxes in JSON format.
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
    FROM (
      -- Get all current assignments. We assume children of broken parents
      -- will ALWAYS be assigned, even if null.
      -- This assumption is cheaper than filtering all possible children
      SELECT DISTINCT geo_id
      FROM document.assignments
      WHERE document_id = $1
      UNION
      -- Get the rest of the potentially unassigned parents
      SELECT path as geo_id
      -- Parent Layer
      FROM gerrydb.%I
    ) ids
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
