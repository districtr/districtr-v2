CREATE OR REPLACE FUNCTION create_assignment_partition_sql(document_id text)
       RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN format('CREATE TABLE "assignments_%s" PARTITION OF assignments
            FOR VALUES IN (''%1$s'')', document_id);
END
$$;