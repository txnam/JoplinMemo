import { markdown } from './parseMemoDocument';
import { Slide } from './types';
import { imageOnlySpans } from './imageOnly';

/** An image must occupy a line by itself; its caption may follow without a blank line. */
export function parseSlides(source: string): Slide[] {
 const images = imageOnlySpans(source);
 if (images) return images.map((image, index) => ({ id: `slide-${index + 1}`, imageMarkdown: source.slice(image.start, image.end), alt: image.alt, caption: image.alt }));
 const env = {};
 const tokens = markdown.parse(source, env);
 const lines = source.replace(/\r\n|\r/g, '\n').split('\n');
 const slides: Slide[] = [];
 let allowedHeading = true;
 const appendCaption = (text: string) => {
  if (!text.trim()) return;
  const last = slides[slides.length - 1];
  last.caption += (last.caption ? '\n\n' : '') + text;
 };
 for (let i = 0; i < tokens.length; i++) {
  const token = tokens[i];
  if (token.level !== 0 || !token.map || token.type === 'inline') continue;
  if (token.type === 'hr') continue;
  if (token.type === 'heading_open' && allowedHeading && !slides.length) { allowedHeading = false; continue; }
  const inline = token.type === 'paragraph_open' ? tokens[i + 1] : null;
  if (inline?.type === 'inline') {
   let captionLines: string[] = [];
   for (const line of inline.content.split('\n')) {
    const children = markdown.parseInline(line, env)[0]?.children || [];
    const images = children.filter(t => t.type === 'image');
    const imageOnly = images.length && children.every(t => t.type === 'image' || (t.type === 'text' && !t.content.trim()));
    if (imageOnly) {
     if (captionLines.length) { appendCaption(captionLines.join('\n')); captionLines = []; }
     for (const image of images) {
      const src = String(image.attrGet('src') || '');
      const title = String(image.attrGet('title') || '');
      slides.push({ id: `slide-${slides.length + 1}`, alt: image.content,
       imageMarkdown: `![${image.content.replace(/([\[\]\\])/g, '\\$1')}](<${src.replace(/>/g, '%3E')}>${title ? ` "${title.replace(/"/g, '&quot;')}"` : ''})`, caption: '' });
     }
    } else {
     if (images.length || (!slides.length && line.trim())) return [];
     captionLines.push(line);
    }
   }
   if (captionLines.length) appendCaption(captionLines.join('\n'));
  } else {
   if (!slides.length || ['fence', 'code_block', 'html_block'].includes(token.type)) return [];
   appendCaption(lines.slice(token.map[0], token.map[1]).join('\n'));
  }
  allowedHeading = false;
 }
 return slides.map(s => ({ ...s, caption: s.caption || s.alt }));
}
