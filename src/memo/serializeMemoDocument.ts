import { DEFAULT_MEMO_COLOR, Memo, MemoDocument } from './types';

function colorMarker(memo: Memo): string { return memo.color !== DEFAULT_MEMO_COLOR ? ` [[${memo.color}]]` : ''; }
function titleText(memo: Memo): string { return memo.title.replace(/[\r\n]+/g, ' ') + colorMarker(memo); }
function indent(body: string, prefix: string, eol: string): string { return body.replace(/\r\n|\r/g, '\n').split('\n').map(line => line ? prefix + line : line).join(eol); }

export function serializeMemoDocument(document: MemoDocument): string {
 const original = document.original;
 const rule = document.rule;
 const eol = original?.eol || '\n';
 const orderChanged = !original || original.ids.join('\0') !== document.memos.map(m => m.id).join('\0');
 const memos = rule.type === 'abstract-heading'
  ? [...document.memos.filter(m => m.source === 'abstract'), ...document.memos.filter(m => m.source !== 'abstract')]
  : document.memos;
 if (!orderChanged && memos.every(m => m.original && m.title === m.original.title && m.body === m.original.body && m.color === m.original.color)) return original!.markdown;
 const blocks = memos.map((memo, index) => {
  const old = memo.original;
  let prefix = old?.prefix || '';
  if (!old) {
   if (rule.type === 'heading' || (rule.type === 'abstract-heading' && memo.source !== 'abstract')) prefix = '#'.repeat(rule.level) + ' ';
   if (rule.type === 'unordered-list') prefix = ' '.repeat(rule.indent) + '- ';
  }
  if (orderChanged && rule.type === 'ordered-list') prefix = ' '.repeat(rule.indent) + `${(rule.start || 1) + index}${rule.delimiter || '.'} `;
  if (orderChanged && rule.type === 'reverse-number-slash') prefix = ' '.repeat(rule.indent) + `${memos.length - index}/ `;
  if (old?.whole) return memo.body === old.body ? old.raw : memo.body.replace(/\r\n|\r|\n/g, eol);
  const isList = ['unordered-list', 'ordered-list', 'reverse-number-slash'].includes(rule.type);
  const bodyPrefix = isList ? ' '.repeat(prefix.length) : '';
  if (old) {
   const firstEnd = old.raw.search(/[\r\n]/);
   const firstLineEnd = firstEnd < 0 ? old.raw.length : firstEnd;
   const title = memo.title === old.title && memo.color === old.color ? old.raw.slice(old.titleStart, old.titleEnd) : titleText(memo);
   const head = prefix + title + old.raw.slice(old.titleEnd, firstLineEnd);
   if (memo.body === old.body && bodyPrefix === old.bodyIndent) return head + old.raw.slice(firstLineEnd);
   return head + (memo.body ? eol + indent(memo.body, bodyPrefix, eol) : '');
  }
  return prefix + titleText(memo) + (memo.body ? eol + indent(memo.body, bodyPrefix, eol) : '');
 });
 if (!orderChanged) return (original?.prefix || '') + blocks.map((block, i) => block + (memos[i].original?.gap || '')).join('');
 const defaultGap = rule.type === 'separator-section' ? `${eol}${eol}${rule.marker}${eol}${eol}` : rule.type === 'unordered-list' || rule.type === 'ordered-list' ? eol : eol + eol;
 // Keep each existing boundary style in its original slot. A moved last memo cannot swallow its neighbour.
 const gaps = original?.ids.map(id => document.memos.find(m => m.id === id)?.original?.gap || '') || [];
 const trailing = gaps[gaps.length - 1] || '';
 return (original?.prefix || '') + blocks.map((block, i) => block + (i === blocks.length - 1 ? trailing : i < gaps.length - 1 && gaps[i] ? gaps[i] : defaultGap)).join('');
}
