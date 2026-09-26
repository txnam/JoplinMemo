import MarkdownIt from 'markdown-it';
type Token = ReturnType<typeof markdown.parse>[number];
import { DEFAULT_MEMO_COLOR, Memo, MemoDocument, MemoSplitRule } from './types';
import { readTitle } from './colors';
import { imageOnlySpans } from './imageOnly';

export const markdown = new MarkdownIt({ html: true, breaks: false });
let nextId = 0;
export function newMemoId(): string { return `memo-${++nextId}`; }

type Boundary = { line: number; source: Memo['source']; level?: number; prefix?: string; number?: number; whole?: boolean };

/** Token maps select boundaries; original byte slices, rather than regenerated tokens, are saved. */
export function parseMemoDocument(noteId: string, noteTitle: string, source: string): MemoDocument {
 const env: { references?: Record<string, { href: string; title: string }> } = {};
 const tokens = markdown.parse(source, env);
 const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [''];
 if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
 const offsets = [0];
 for (const line of lines) offsets.push(offsets[offsets.length - 1] + line.length);
 const lineText = (i: number) => (lines[i] || '').replace(/[\r\n]+$/, '');
 const top = tokens.filter(t => t.level === 0 && t.map && t.type !== 'inline');
 const images = imageOnlySpans(source);
 if (images) {
  const memos: Memo[] = images.map((image, index) => {
   const raw = source.slice(image.start, image.end);
   const gap = source.slice(image.end, images[index + 1]?.start ?? source.length);
   const title = image.alt;
   return { id: newMemoId(), title, body: raw, color: DEFAULT_MEMO_COLOR, source: 'image',
    original: { raw, gap, title, body: raw, color: DEFAULT_MEMO_COLOR, titleStart: 0, titleEnd: 0, bodyStart: 0, prefix: '', bodyIndent: '', whole: true } };
  });
  const references = Object.entries(env.references || {}).map(([key, r]) => `[${key}]: <${r.href}>${r.title ? ` "${r.title.replace(/"/g, '&quot;')}"` : ''}`).join('\n');
  return { noteId, title: noteTitle || 'Untitled note', rule: { type: 'block' }, memos, references,
   original: { markdown: source, ids: memos.map(m => m.id), prefix: source.slice(0, images[0].start), eol: /\r\n|\r|\n/.exec(source)?.[0] || '\n' } };
 }
 const first = top[0];
 let rule: MemoSplitRule = { type: 'block' };
 let boundaries: Boundary[] = [];
 const heading = (t: Token): Boundary => ({ line: t.map![0], source: 'heading', level: Number(t.tag.slice(1)) });
 const firstText = first ? lineText(first.map![0]) : '';
 // Slash-number lists are a plugin convention, not a CommonMark list.
 const slash = /^( *)\d+\/\s+/.exec(firstText);
 if (slash && first?.type === 'paragraph_open') {
  const excluded = new Set<number>();
  for (const token of tokens) if (token.map && ['fence', 'code_block', 'html_block'].includes(token.type)) {
   for (let i = token.map[0]; i < token.map[1]; i++) excluded.add(i);
  }
  lines.forEach((_, line) => {
   const m = /^( *)(\d+)\/\s+/.exec(lineText(line));
   if (m && m[1].length === slash[1].length && !excluded.has(line)) boundaries.push({ line, source: 'reverse-number-list', prefix: m[0], number: Number(m[2]) });
  });
  rule = { type: 'reverse-number-slash', indent: slash[1].length, bodyIndent: slash[0].length };
 } else if (first?.type === 'heading_open' && /^#{1,6}\s/.test(firstText)) {
  boundaries = top.filter(t => t.type === 'heading_open' && t.tag === first.tag).map(heading);
  rule = { type: 'heading', level: Number(first.tag.slice(1)) };
 } else if (first && ['bullet_list_open', 'ordered_list_open'].includes(first.type)) {
  const ordered = first.type === 'ordered_list_open';
  const prefix = /^( *)(?:[-*+]|\d+[.)])\s+/.exec(firstText);
  const listTokens = top.filter(t => t.type === first.type);
  // A trailing top-level paragraph or another structure cannot safely belong to a list item.
  const coveredEnd = listTokens[listTokens.length - 1]?.map?.[1] || 0;
  const unrelated = top.some(t => t.type !== first.type);
  if (prefix && !unrelated) {
   boundaries = tokens.filter(t => t.type === 'list_item_open' && t.level === 1 && t.map && t.map[0] < coveredEnd).map(t => {
    const p = /^( *)(?:[-*+]|(\d+)[.)])\s+/.exec(lineText(t.map![0]))!;
    return { line: t.map![0], source: 'list', prefix: p[0], number: p[2] ? Number(p[2]) : undefined };
   });
   rule = ordered
    ? { type: 'ordered-list', indent: prefix[1].length, bodyIndent: prefix[0].length, start: boundaries[0]?.number || 1, delimiter: /\d+([.)])/.exec(prefix[0])?.[1] || '.' }
    : { type: 'unordered-list', indent: prefix[1].length, bodyIndent: prefix[0].length };
  }
 } else if (first?.type === 'paragraph_open' || first?.type === 'hr') {
  const rules = top.filter(t => t.type === 'hr' && /^\S/.test(lineText(t.map![0])));
  if (rules.length && top.some(t => t.type !== 'hr')) {
   rule = { type: 'separator-section', marker: lineText(rules[0].map![0]) };
   const starts = [first.map![0], ...rules.map(t => t.map![1])];
   for (const start of starts) {
    let line = start;
    while (line < lines.length && !lineText(line).trim()) line++;
    if (line >= lines.length || rules.some(t => t.map![0] === line)) continue;
    const h = /^(#{1,6})\s+/.exec(lineText(line));
    const token = top.find(t => t.map![0] === line);
    boundaries.push({ line, source: h ? 'heading' : 'separator-section', level: h?.[1].length, whole: !!token && !['paragraph_open', 'heading_open'].includes(token.type) });
   }
  } else {
   const h = top.find(t => t.type === 'heading_open' && /^#{1,6}\s/.test(lineText(t.map![0])));
   if (h && h.map![0] > first.map![0]) {
    rule = { type: 'abstract-heading', level: Number(h.tag.slice(1)) };
    boundaries = [{ line: first.map![0], source: 'abstract' }, ...top.filter(t => t.type === 'heading_open' && t.tag === h.tag).map(heading)];
   } else if (top.every(t => t.type === 'paragraph_open')) {
    boundaries = top.map(t => ({ line: t.map![0], source: 'block' }));
   }
  }
 }
 // Unsupported structures stay intact, including fenced code before a heading.
 if (!boundaries.length && source.trim()) boundaries = [{ line: first?.map?.[0] || 0, source: 'whole-note', whole: true }];
 const eol = /\r\n|\r|\n/.exec(source)?.[0] || '\n';
 const memos: Memo[] = boundaries.map((b, index) => {
  const start = offsets[b.line];
  const end = index + 1 < boundaries.length ? offsets[boundaries[index + 1].line] : source.length;
  const chunk = source.slice(start, end);
  let raw = chunk.replace(/(?:\r\n|\r|\n|[ \t])+$/, '');
  // Separators belong to the boundary, not to the preceding memo body.
  if (rule.type === 'separator-section') {
   const hr = top.find(t => t.type === 'hr' && offsets[t.map![0]] >= start && offsets[t.map![0]] < end);
   if (hr) raw = source.slice(start, offsets[hr.map![0]]).replace(/\s+$/, '');
  }
  const gap = chunk.slice(raw.length);
  const firstLine = raw.split(/\r\n|\r|\n/)[0];
  const prefix = b.prefix || (b.level ? /^(#{1,6})\s+/.exec(firstLine)?.[0] || '' : '');
  const headingSuffix = b.level ? /\s+#+\s*$/.exec(firstLine)?.[0] || '' : '';
  const titleEnd = firstLine.length - headingSuffix.length;
  const parsed = readTitle(firstLine.slice(prefix.length, titleEnd));
  const bodyStart = firstLine.length + (/\r\n|\r|\n/.exec(raw.slice(firstLine.length))?.[0].length || 0);
  const bodyIndent = b.prefix ? ' '.repeat(b.prefix.length) : '';
  const body = b.whole ? raw : raw.slice(bodyStart).split(/\r\n|\r|\n/).map(l => bodyIndent && l.startsWith(bodyIndent) ? l.slice(bodyIndent.length) : l).join('\n');
  const title = b.whole ? noteTitle || 'Note content' : parsed.title;
  const color = b.whole ? DEFAULT_MEMO_COLOR : parsed.color;
  return {
   id: newMemoId(), title, body, color, source: b.source, headingLevel: b.level, number: b.number,
   original: { raw, gap, title, body, color, titleStart: prefix.length, titleEnd, bodyStart, prefix, bodyIndent, whole: !!b.whole },
  };
 });
 const references = Object.entries(env.references || {}).map(([key, r]) => `[${key}]: <${r.href}>${r.title ? ` "${r.title.replace(/"/g, '&quot;')}"` : ''}`).join('\n');
 return { noteId, title: noteTitle || 'Untitled note', rule, memos, references,
  original: { markdown: source, ids: memos.map(m => m.id), prefix: boundaries.length ? source.slice(0, offsets[boundaries[0].line]) : source, eol },
 };
}

/** Keep selection identity across external updates when an unchanged memo can be identified. */
export function reconcileMemoIds(document: MemoDocument, previous: MemoDocument): void {
 if (document.noteId !== previous.noteId) return;
 const unused = [...previous.memos];
 for (const memo of document.memos) {
  const index = unused.findIndex(old => old.original?.raw === memo.original?.raw);
  if (index >= 0) memo.id = unused.splice(index, 1)[0].id;
 }
 if (document.original) document.original.ids = document.memos.map(m => m.id);
}
