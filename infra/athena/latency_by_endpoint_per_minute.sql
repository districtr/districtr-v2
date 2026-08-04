-- Server-side latency p50/p95/p99 per endpoint per minute, stress-test
-- traffic only. target_processing_time is -1 when the request never reached
-- a target (ALB-generated 5xx) — excluded here, counted in the error query.
-- Document UUIDs are collapsed so all per-document URLs group into one row
-- per route (e.g. /api/get_assignments/{id}).
SELECT
  date_trunc('minute', from_iso8601_timestamp(time)) AS minute,
  regexp_replace(
    url_extract_path(request_url),
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    '{id}'
  ) AS endpoint,
  count(*) AS requests,
  approx_percentile(target_processing_time, 0.50) AS p50_s,
  approx_percentile(target_processing_time, 0.95) AS p95_s,
  approx_percentile(target_processing_time, 0.99) AS p99_s,
  max(target_processing_time) AS max_s
FROM alb_access_logs
WHERE user_agent LIKE 'districtr-stress-test/%'
  AND target_processing_time >= 0
GROUP BY 1, 2
ORDER BY 1, 2;
