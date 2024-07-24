CREATE OR REPLACE FUNCTION create_document()
    RETURNS TABLE (
        document_id UUID,
        created_at timestamp with time zone,
        updated_at timestamp with time zone,
        gerry_db_table varchar
    ) 
AS $$
DECLARE
  doc_id uuid;
  doc_id_text text;
  stmt text;
BEGIN
  doc_id := gen_random_uuid();
  INSERT INTO document( document_id )  VALUES (doc_id);
  stmt := create_assignment_partition_sql(CAST(doc_id AS text));
  EXECUTE stmt;
  RETURN QUERY 
    SELECT document.document_id,
            document.created_at,
            document.updated_at,
            document.gerrydb_table 
    FROM document
    WHERE document.document_id=doc_id;
END;
$$ LANGUAGE plpgsql;