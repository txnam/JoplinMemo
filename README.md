# JoplinMemo

JoplinMemo is a Joplin plugin that adds a compact memo-board view for ordinary notes.

It does not introduce a new Markdown format. Instead, it reads the current note and splits it into loose memo-like parts:

- If the first structured part is a heading, the same heading level becomes the memo separator. For example, notes beginning with `## H2` are split by each `## H2`, while nested `### H3` content stays inside that memo.
- If the first structured part is a bullet or numbered list item, items of the same list style and indentation become separate memos.
- Mixed prose is split by blank lines, with the first line used as the memo title.

Add a color marker such as `[[#facc15]]` or `[[blue]]` at the end of a memo title to color that memo.

## Build

```sh
npm install
npm run typecheck
npm run dist
```

The generated `.jpl` plugin archive is written to `publish/`.
