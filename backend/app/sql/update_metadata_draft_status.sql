-- migrations/sql/udf_update_metadata_draft_status.sql

CREATE OR REPLACE FUNCTION update_metadata_draft_status(map_metadata JSONB)
RETURNS JSONB
LANGUAGE SQL
AS $$
    SELECT
      jsonb_strip_nulls(
        map_metadata
        - 'is_draft'
        || jsonb_build_object(
          'draft_status',
          CASE
            WHEN (map_metadata->>'is_draft')::boolean IS TRUE THEN 'in_progress'
            WHEN (map_metadata->>'is_draft')::boolean IS FALSE THEN 'ready_to_share'
            ELSE 'scratch'
          END
        )
      )
$$;
