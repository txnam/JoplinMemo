# JoplinMemo

JoplinMemo is a Joplin plugin that adds a compact memo-board view for ordinary notes.

It does not introduce a new Markdown format. Instead, it reads the current note and splits it into loose memo-like parts:

- Horizontal rules such as `* * *`, `***`, `---`, `- - -`, `___`, or `_ _ _` become explicit section separators. The detected separator style is kept when the note is saved.
- Notes with an abstract before the first heading are split into one abstract memo followed by heading memos. For example, an introduction followed by `## H2` sections becomes an abstract memo plus one memo per `## H2`.
- If the first structured part is a heading, the same heading level becomes the memo separator. For example, notes beginning with `## H2` are split by each `## H2`, while nested `### H3` content stays inside that memo.
- If the first structured part is a bullet or numbered list item, items of the same list style and indentation become separate memos.
- Mixed prose is split by blank lines, with the first line used as the memo title.

Add a color marker such as `[[#facc15]]` or `[[blue]]` at the end of a memo title to color that memo.

## Memo rules

JoplinMemo separates parsing from display:

- Split mode decides how Markdown is converted to memos.
- Display mode decides whether the memo board shows only compact cards or cards plus a detail pane.

Split modes are detected in this order:

1. Separator sections with Markdown horizontal rules.
2. Abstract plus headings.
3. Headings of the same level.
4. Unordered or ordered list items of the same indentation.
5. Reverse numbered items such as `3/ Title`.
6. Blank-line blocks.
7. Whole-note fallback.

Display modes:

- Compact mode is used when every memo has only a title. It shows the memo grid only.
- Full mode is used when at least one memo has body content. It shows the memo grid and a detail pane. On mobile, the grid and detail pane are stacked.

## Build

```sh
npm install
npm test
npm run typecheck
npm run dist
```

The generated `.jpl` plugin archive is written to `publish/`.
