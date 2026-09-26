# 0.4.1 validation record

- 92 automated tests passed, including toolbar removal, double-click editing, drag/drop failure recovery, per-image splitting, reference and HTML images, blank HTML tails, and source-preserving edits/reorders.
- TypeScript checking, production build, archive contents/version/hash verification and `git diff --check` passed.
- Chromium QA with the built bundle: three consecutive images followed by a blank line and `<br>` produced exactly three cards; no card/detail toolbars remained. Dragging changed the order, and double-clicking the detail image opened the correct Markdown editor without opening the zoom viewer. No browser console errors were recorded.
- Browser QA uses simulated Joplin messages. This patch has not been installed into a live Joplin profile or checked on a physical Android device in this environment.

The installable artifact is `publish/com.github.txnam.joplinmemo.jpl` (version 0.4.1).
