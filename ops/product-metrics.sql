WITH totals AS (
  SELECT
    COUNT(DISTINCT CASE WHEN name = 'visited' THEN session_id END) AS users,
    COUNT(DISTINCT CASE WHEN name = 'archive_opened' THEN session_id END) AS archive_openers,
    COUNT(DISTINCT CASE WHEN name = 'search_used' THEN session_id END) AS searchers,
    COUNT(DISTINCT CASE WHEN name = 'exported' THEN session_id END) AS exporters,
    COUNT(DISTINCT CASE WHEN name = 'saved_locally' THEN session_id END) AS local_savers,
    COUNT(DISTINCT CASE WHEN name = 'local_copy_opened' THEN session_id END) AS local_reopeners,
    COUNT(DISTINCT CASE WHEN name = 'cleared' THEN session_id END) AS clearers,
    COUNT(DISTINCT CASE WHEN name = 'returned' THEN session_id END) AS returned,
    COUNT(DISTINCT CASE
      WHEN name = 'visited' AND occurred_on >= date('now', '-6 days') THEN session_id
    END) AS users_7d,
    COUNT(DISTINCT CASE
      WHEN name = 'archive_opened' AND occurred_on >= date('now', '-6 days') THEN session_id
    END) AS archive_openers_7d,
    COUNT(DISTINCT CASE
      WHEN name = 'search_used' AND occurred_on >= date('now', '-6 days') THEN session_id
    END) AS searchers_7d
  FROM product_events
)
SELECT * FROM totals;
