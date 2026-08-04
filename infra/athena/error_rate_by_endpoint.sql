-- Error rate by endpoint, stress-test traffic only. Uses elb_status_code
-- (always set) rather than target_status_code ("-" for ALB-generated errors),
-- so ALB 502/503/504s are included.
SELECT
  regexp_replace(
    url_extract_path(request_url),
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    '{id}'
  ) AS endpoint,
  count(*) AS requests,
  count_if(elb_status_code BETWEEN 400 AND 499) AS count_4xx,
  count_if(elb_status_code >= 500) AS count_5xx,
  round(100.0 * count_if(elb_status_code >= 500) / count(*), 2) AS pct_5xx
FROM alb_access_logs
WHERE user_agent LIKE 'districtr-stress-test/%'
GROUP BY 1
ORDER BY count_5xx DESC, requests DESC;
