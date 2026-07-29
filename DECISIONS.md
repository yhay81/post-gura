# Decisions

## Local-first archive reader

X archives can contain direct messages, media and account details. Uploading the archive would create a high-risk data store without being necessary for search. ZIP selection, decompression, normalization, filtering and export therefore run in the browser.

## No authentication

There is no server-side user record to protect. A local copy is stored only after an explicit action and remains under browser storage controls. Better Auth is not included.

## Narrow parser

The ZIP reader scans the central directory but opens only allowlisted post, like, bookmark and note-post files. It rejects encrypted entries, unsafe numeric offsets, excessive metadata and oversized selected text.

## Product surface

The first viewport is a compact visual workbench: archive box, chronological drawers, search aperture and result slips. Research language, validation criteria and platform comparisons do not appear in the product.

## Distribution

The canonical host is `post-gura.yhay81.com`. Discovery is limited to the public repository, Tool Shelf, search indexing and voluntary user sharing.
