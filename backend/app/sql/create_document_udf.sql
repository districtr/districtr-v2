CREATE FUNCTION create_document()
    RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  doc_id uuid;
  doc_id_text text;
  stmt text;
BEGIN
  doc_id := gen_random_uuid();
  INSERT INTO document( document_id )  VALUES (doc_id);
  doc_id_text := CAST(doc_id as text);
  stmt := create_assignment_partition_sql(doc_id_text);
  EXECUTE stmt;
  RETURN doc_id;
END
$$;