import MarkdownIt from 'markdown-it';

const scanner = new MarkdownIt({ html: true });
type InlineRule = Parameters<typeof scanner.inline.ruler.before>[2];
// Wrap the standard rules without reimplementing Markdown's nested brackets, escapes or references.
for (const name of ['image', 'html_inline']) {
 const capture: InlineRule = (state, silent) => {
  const rules = scanner.inline.ruler.getRules('');
  const start = state.pos;
  const count = state.tokens.length;
  const matched = rules[rules.indexOf(capture) + 1](state, silent);
  if (matched && !silent && state.tokens.length > count) {
   state.tokens[state.tokens.length - 1].meta = { start, end: state.pos };
  }
  return matched;
 };
 scanner.inline.ruler.before(name, `memo_span_${name}`, capture);
}
export type ImageSpan = { start: number; end: number; alt: string };

/** Return exact source spans only when all visible content is images. Blank HTML is whitespace too. */
export function imageOnlySpans(source: string): ImageSpan[] | null {
 const env = {};
 const tokens = scanner.parse(source, env);
 const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || [];
 const offsets = [0];
 for (const line of lines) offsets.push(offsets[offsets.length - 1] + line.length);
 const images: ImageSpan[] = [];
 for (const block of tokens) {
  if (block.level !== 0 || !block.map || block.type === 'inline') continue;
  if (block.type !== 'paragraph_open' && block.type !== 'html_block') return null;
  const start = offsets[block.map[0]];
  const raw = source.slice(start, offsets[block.map[1]]);
  const inline: typeof tokens = [];
  // Bypass the core newline normalizer: token offsets must refer to the original CRLF source.
  scanner.inline.parse(raw, scanner, env, inline);
  for (const token of inline) {
   if (token.type === 'image' || (token.type === 'html_inline' && /^<img\b[^>]*\bsrc\s*=/i.test(token.content))) {
    if (!token.meta || typeof token.meta.start !== 'number' || typeof token.meta.end !== 'number') return null;
    const alt = token.type === 'image' ? token.content : /\balt\s*=\s*["']([^"']*)["']/i.exec(token.content)?.[1] || '';
    images.push({ start: start + token.meta.start, end: start + token.meta.end, alt });
   } else if ((token.type === 'text' || token.type === 'text_special') && !token.content.replace(/\u200b/g, '').trim()) {
    continue;
   } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
    continue;
   } else if (token.type === 'html_inline' && /^<(?:br\s*\/?|\/?p\s*)>$/i.test(token.content.trim())) {
    continue;
   } else return null;
  }
 }
 return images.length ? images : null;
}
