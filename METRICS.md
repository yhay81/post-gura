# Metrics

Events are deduplicated per browser, event and JST day and retained for 45 days.

| Event               | Meaning                                             |
| ------------------- | --------------------------------------------------- |
| `visited`           | Public workspace loaded                             |
| `archive_opened`    | Supported archive data was parsed                   |
| `search_used`       | A non-empty query or restrictive filter was applied |
| `exported`          | CSV, JSON or print export was used                  |
| `saved_locally`     | Normalized data was explicitly saved to IndexedDB   |
| `local_copy_opened` | A saved local copy was reopened                     |
| `cleared`           | Workspace and local copy were cleared               |
| `returned`          | Browser returned on another JST date                |

The metric query reports daily-window users and an action funnel. No archive text, search terms, filenames, dates selected by the user or result counts are telemetry.
