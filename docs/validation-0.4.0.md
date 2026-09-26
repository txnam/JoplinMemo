# 0.4.0 validation record

## Automated coverage

The local run passed **79 automated tests**. `npm test` exercises source round trips, isolated edits, numbering, mixed separators, album detection, asynchronous note loads/saves, conflicts, idempotency, delayed host persistence confirmation, render failures/cache invalidation, form drafts, sanitized HTML, image retention, zoom/pinch/swipe and slideshow timer lifecycle. A 1,000-memo source fixture checks that reorder retains all items. Tests use real parser/sanitizer code and mock the Joplin host API.

`npm run typecheck`, `npm run dist`, and `npm run verify:package` verify TypeScript and the archive. CI is configured for Node 22 on Windows and Linux; a local passing run does not establish that remote CI has run.

## Browser QA

The local development host uses the built webview bundle and simulated Joplin messages. Desktop and 390 x 844 layouts were inspected in Chromium. The full reader shows an entire long compact memo, formatting and numbering survive, and the image viewer displays captions and zooms without console errors. Screenshots are local build artifacts under `output/playwright/` (not part of the plugin).

Browser emulation and synthetic pointer tests do not certify Android WebView behaviour or native Joplin resource access.

## Required host acceptance before public release

Not yet performed in this environment:

- Install the JPL in a disposable Joplin desktop profile and Joplin Android 3.5.1+.
- Check native `renderMarkup` output and note/resource links, real attachment URLs, offline images and sync downloads.
- Check compact reading, colour edits, failed saves and rapid note switching with actual Joplin events.
- Check pinch/pan/swipe, rotation, the software keyboard, background pause, fullscreen availability and light/dark themes on a physical Android device.
- Check a large note/album for bridge responsiveness and image memory behaviour.

The local JPL is a build artifact ready for these checks, not a published marketplace release. No user Joplin notes were edited or used as fixtures.
