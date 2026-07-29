# Security

Report vulnerabilities privately through GitHub private vulnerability reporting.

## Data boundary

- ZIP parsing and search run entirely in the browser.
- Only an allowlist of post-like file names is considered.
- Encrypted entries and unsupported compression methods are rejected.
- ZIP64 metadata is bounded and numeric offsets must remain safe integers.
- Central-directory and extracted-text size limits reduce memory exhaustion risk.
- Text is rendered with DOM `textContent`; archive HTML is never executed.
- CSV export escapes spreadsheet-formula prefixes.
- Direct messages and media entries are never opened.

No secrets belong in the repository.
