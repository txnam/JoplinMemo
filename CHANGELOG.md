# Changelog

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
