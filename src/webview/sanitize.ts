import DOMPurify from 'dompurify';

export function safeHtml(html: string): string {
 const clean = DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['p', 'br', 'hr', 'div', 'span', 'strong', 'b', 'em', 'i', 's', 'del', 'sub', 'sup', 'mark', 'a', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'input'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'start', 'value', 'type', 'checked', 'disabled', 'colspan', 'rowspan', 'align', 'data-resource-id'],
  ALLOW_DATA_ATTR: false,
  ADD_URI_SAFE_ATTR: ['start', 'value', 'type', 'checked', 'disabled', 'colspan', 'rowspan', 'align', 'data-resource-id'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|file|joplin-content):|:\/|#|data:image\/(?:png|jpeg|gif|webp);base64,)/i,
 });
 const template = document.createElement('template');
 template.innerHTML = clean;
 template.content.querySelectorAll('input').forEach(input => { if (input.type !== 'checkbox') input.remove(); else input.disabled = true; });
 template.content.querySelectorAll('img').forEach(img => { img.loading = 'lazy'; img.decoding = 'async'; });
 return template.innerHTML;
}
export function inlineHtml(html: string): string {
 const template = document.createElement('template');
 template.innerHTML = safeHtml(html);
 template.content.querySelectorAll('p,h1,h2,h3,h4,h5,h6').forEach(node => node.replaceWith(...Array.from(node.childNodes)));
 return template.innerHTML;
}
export function escapeHtml(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
export function firstImage(html: string): { src: string; alt: string } | null {
 const template = document.createElement('template');
 template.innerHTML = safeHtml(html);
 const img = template.content.querySelector('img');
 return img?.getAttribute('src') ? { src: img.getAttribute('src')!, alt: img.getAttribute('alt') || '' } : null;
}
