import joplin from 'api';
import { MemoDocument, RenderedMemo, RenderedSlide } from '../memo/types';
import { parseSlides } from '../memo/slides';

const cache = new Map<string, string>();
export function clearRenderCache(): void { cache.clear(); }
function escape(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

export async function renderDocument(document: MemoDocument, source: string): Promise<{ rendered: Record<string, RenderedMemo>; slides: RenderedSlide[]; resourcePaths: Record<string, string> }> {
 let theme = 'default';
 try { theme = JSON.stringify(await joplin.settings.globalValues(['theme', 'themeAutoDetect', 'preferredDarkTheme', 'preferredLightTheme'])); } catch (_) { /* older hosts */ }
 const render = async (text: string): Promise<string> => {
  if (!text.trim()) return '';
  const input = text + (document.references ? '\n\n' + document.references : '');
  const key = `${document.noteId}\0${theme}\0${input}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const result = await joplin.commands.execute('renderMarkup', 1, input, null, { bodyOnly: true, noteId: document.noteId });
  const html = typeof result === 'string' ? result : result?.html;
  if (typeof html !== 'string') throw new Error('Joplin did not return rendered Markdown.');
  if (cache.size >= 300) cache.delete(cache.keys().next().value as string);
  cache.set(key, html);
  return html;
 };
 const rendered: Record<string, RenderedMemo> = {};
 // Bound concurrency to avoid flooding the mobile bridge for large notes.
 const jobs = document.memos.map(memo => async () => {
  try {
   const title = await render(memo.title);
   const body = await render(memo.body);
   const prefix = memo.original?.prefix || '';
   const fullSource = memo.original?.whole ? memo.body : prefix + memo.title + (memo.body ? '\n' + memo.body.split('\n').map(l => memo.original?.bodyIndent && l ? memo.original.bodyIndent + l : l).join('\n') : '');
   rendered[memo.id] = { title, body, full: await render(fullSource) };
  } catch (error) {
   rendered[memo.id] = { title: `<span>${escape(memo.title)}</span>`, body: `<pre>${escape(memo.body)}</pre>`, full: `<pre>${escape(memo.original?.raw || `${memo.title}\n${memo.body}`)}</pre>`, error: error instanceof Error ? error.message : 'Render failed' };
  }
 });
 let next = 0;
 await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => { while (next < jobs.length) await jobs[next++](); }));
 const slides: RenderedSlide[] = [];
 for (const slide of parseSlides(source)) {
  try { slides.push({ ...slide, imageHtml: await render(slide.imageMarkdown), captionHtml: await render(slide.caption) }); }
  catch (error) { slides.push({ ...slide, imageHtml: '', captionHtml: `<pre>${escape(slide.caption)}</pre>`, error: error instanceof Error ? error.message : 'Render failed' }); }
 }
 // Resource URLs are carried inside Joplin-rendered HTML, including its platform-specific scheme.
 return { rendered, slides, resourcePaths: {} };
}
