# Changelog

## 0.4.2

- Hide generated titles on image-only memo cards while preserving image alt text and source Markdown.
- Close image viewing with a single click on the image or stage; keep pan, pinch and slide swipe gestures distinct.
- Show compact tooltips for selected cards and add Edit beside + Memo and beside Close in the compact reader.
- Let keyboard focus select the compact memo targeted by toolbar Edit.

## 0.4.1

- Remove per-card Edit/Read/up/down toolbars and detail toolbar to give more space to memo content.
- Edit cards, detail and compact reading panes by double-click; retain drag-and-drop ordering and an F2 edit shortcut.
- Split image-only notes into one memo per image, including reference and HTML images; ignore visually empty trailing content without deleting source text.
- Preserve original image markup, whitespace and reference definitions when saving or reordering.


## 0.4.0

- Preserve original Markdown source, separators, list markers and line endings; retain unsupported structures intact.
- Add revision checks, serialized/idempotent saves, retained drafts and explicit conflict recovery.
- Use Joplin-rendered and sanitized HTML for memo titles, tips, detail, reading panes and slide captions.
- Correct numbered-list starts and numbering after additions/reorders.
- Add a complete compact reader and explicit edit/move controls for mobile and keyboard users.
- Add image thumbnails, fit/original-size viewing, wheel/pinch zoom, panning and retries.
- Add automatic album detection and opt-in image slideshow with captions, interval selection and looping.
- Require Joplin 3.5.1, package all icons, fail broken archive builds and add Windows/Linux CI checks.
- Expand parser, host bridge and webview regression coverage; update build dependencies.

## 0.3.1

- Fix stale memo content when switching notes on mobile after returning from Markdown view.
- Refine split priority so heading, list, and reverse-number notes are not overridden by nested horizontal rules.

## 0.3.0

- Add memo split support for notes with an abstract before heading sections.
- Add memo split support for Markdown horizontal-rule separators such as `* * *`, `***`, and `---`.
- Prefer heading, list, and reverse-number memo rules when the note starts with those structures, so nested horizontal rules stay inside memo content.
- Refresh the selected note whenever the memo editor becomes ready, fixing stale memo content after switching notes on mobile.
- Clarify compact and full display behavior so compact notes render as grid-only, including on mobile.
- Keep compact mobile layouts from reserving an unused detail area.
- Clear hover tips during wheel scrolling so memo lists remain scrollable.
- Add parser and serializer coverage for the supported memo rules.

## 0.2.0

- Skip HTML notes and Kanban board notes instead of rendering them as memo boards.
- Update the detail view immediately when selecting a memo.
- Show hover tips only for unfocused memos and disable tips on mobile.
- Position hover tips flush against memo edges and keep memo selection responsive while tips are visible.
- Cancel add/edit mode with Escape.
- Fix mobile activation so the current note is rendered as soon as the memo editor opens.

## 0.1.0

- Initial JoplinMemo memo-board viewer.
