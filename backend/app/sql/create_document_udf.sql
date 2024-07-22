CREATE FUNCTION create_document()
    RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  document_id text;
  stmt text;
BEGIN
  document_id := gen_random_uuid()
  stmt := create_assignment_partition_sql(document_id)
  EXEC stmt
  RETURN document_id;
END
$$;