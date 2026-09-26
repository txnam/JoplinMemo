# 0.4.2 validation record

- 95 automated tests passed. New coverage checks selected compact tooltips, keyboard-focused toolbar editing, reader editing, hidden image-only card titles with retained alt text, and click-to-close without closing after pan, pinch or swipe.
- TypeScript checking, production build, archive contents/version/hash verification and `git diff --check` passed.
- Chromium QA with the built bundle confirmed three image-only cards with no visible titles, opening an image and closing it with one more click, a formatted tooltip for the selected compact card, toolbar Edit opening the selected memo, and reader Edit opening the displayed memo. No browser console errors or warnings were recorded.
- Browser QA uses simulated Joplin messages. This patch has not been installed into a live Joplin profile or checked on a physical Android device in this environment.

The installable artifact is `publish/com.github.txnam.joplinmemo.jpl` (version 0.4.2).
