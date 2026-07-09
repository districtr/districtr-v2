-- The 100 slowest requests (server-side time), stress-test traffic only.
-- sent_bytes distinguishes "large payload" slowness (get_assignments) from
-- "expensive compute" slowness (evaluation).
SELECT
  time,
  request_verb,
  request_url,
  elb_status_code,
  target_status_code,
  target_processing_time AS target_s,
  request_processing_time + response_processing_time AS alb_overhead_s,
  sent_bytes,
  target_ip
FROM alb_access_logs
WHERE user_agent LIKE 'districtr-stress-test/%'
  AND target_processing_time >= 0
ORDER BY target_processing_time DESC
LIMIT 100;
