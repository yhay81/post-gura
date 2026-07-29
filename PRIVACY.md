# Privacy

## Archive handling

The selected X archive stays in the browser. The client reads only supported post-like files from the ZIP. It does not upload the ZIP, posts, search terms, dates, counts, direct messages, media, account details, or contacts.

The Content Security Policy only permits same-origin connections.

## Local storage

A random telemetry session identifier and the last visit date are stored in localStorage. Posts are kept in memory until the page is closed. They are written to IndexedDB only when the user selects the explicit local-save action. The local copy can be deleted from the product.

## Server telemetry

D1 stores whether a browser visited, opened an archive, searched, exported, saved or reopened a local copy, cleared the workspace, or returned on another day. Events contain a random browser identifier and JST date. They do not contain archive contents, search terms, result counts, account names, or file names. Events are deleted after 45 days.

Automated QA is excluded from product telemetry.
