import { COLOR_PALETTE, DEFAULT_MEMO_COLOR, DocumentMessage, Memo, Mutation, MutationResult, PluginMessage, WebviewMessage } from '../memo/types';
import { escapeHtml as esc, firstImage, inlineHtml, safeHtml } from './sanitize';
import { ImageViewer, ViewerImage } from './ImageViewer';

declare const webviewApi: { postMessage: (message: WebviewMessage) => Promise<unknown>; onMessage: (callback: (event: PluginMessage | { message: PluginMessage }) => void) => void };
type Draft = { memoId?: string; title: string; body: string; color: string; revision: number; whole: boolean; conflict: boolean; orphan: boolean };
const root = document.getElementById('app')!;
let snapshot: DocumentMessage | null = null;
let selected = '';
let reader = '';
let status = '';
let pending = '';
let operation = 0;
let dragged = '';
let draft: Draft | null = null;
const drafts = new Map<string, Draft>();
let viewer: ImageViewer | null = null;
let tooltipTimer: number | undefined;
let openTimer: number | undefined;
let allowReload = false;
let refreshOnly = false;
let refreshNoteId = '';
let returnFocusId = '';
type Presentation = { title: string; full: string; excerpt: string; image: { src: string; alt: string } | null };
const presentations = new Map<string, Presentation>();

function presentation(m: Memo): Presentation {
 const cached = presentations.get(m.id);
 if (cached) return cached;
 const rendered = snapshot?.rendered[m.id];
 const title = inlineHtml(rendered?.title || esc(m.title));
 const full = safeHtml(rendered?.full || `<pre>${esc(`${m.title}\n${m.body}`)}</pre>`);
 const template = document.createElement('template');
 template.innerHTML = safeHtml(rendered?.body || esc(m.body));
 const excerpt = (template.content.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240);
 const result = { title, full, excerpt, image: /<img\b/i.test(title) ? null : firstImage(full) };
 presentations.set(m.id, result);
 return result;
}

function memo(id = selected): Memo | undefined { return snapshot?.document.memos.find(m => m.id === id); }
function compact(): boolean { return !snapshot?.document.memos.some(m => m.body.trim()); }
function mobile(): boolean { return window.matchMedia('(pointer: coarse), (max-width: 780px)').matches; }
function titleHtml(m: Memo): string {
 const delimiter = m.source === 'reverse-number-list' ? '/' : /\d+([.)])/.exec(m.original?.prefix || '')?.[1] || '.';
 const prefix = m.number === undefined ? '' : `<span class="memo-number">${m.number}${delimiter} </span>`;
 return prefix + presentation(m).title;
}
function fullHtml(m: Memo): string {
 const render = snapshot?.rendered[m.id];
 return `${render?.error ? '<div class="render-error">Formatting unavailable. <button data-action="retry-render">Retry</button></div>' : ''}${presentation(m).full}`;
}
function button(action: string, text: string, id = '', disabled = false): string {
 return `<button type="button" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ''} ${disabled ? 'disabled' : ''}>${text}</button>`;
}
function card(m: Memo): string {
 const { image, excerpt } = presentation(m);
 const pinned = m.source === 'abstract';
 return `<article class="memo-card ${selected === m.id ? 'is-selected' : ''} ${m.source === 'image' ? 'is-image' : ''}" data-id="${esc(m.id)}" draggable="${!pinned && !draft && !pending}" style="--memo-color:${m.color}">
  <div class="memo-select" role="button" tabindex="0" data-action="select" data-id="${esc(m.id)}" aria-label="Open memo">
   ${m.source === 'image' ? '' : `<div class="memo-title heading-${m.headingLevel || 0}">${titleHtml(m)}</div>`}
   ${image ? `<img class="memo-thumbnail" src="${esc(image.src)}" alt="${esc(image.alt)}" loading="lazy">` : ''}
   ${excerpt ? `<div class="memo-excerpt">${esc(excerpt)}</div>` : ''}
  </div>
 </article>`;
}
function formHtml(): string {
 if (!draft) return '';
 return `<section class="add-memo-panel"><form data-action="save" class="add-memo-form">
  <strong>${draft.memoId ? 'Edit memo' : 'Add memo'}</strong>
  ${draft.whole ? '<p>This structure is kept as one memo. Edit the original Markdown below.</p>' : `<label>Title <input class="memo-input" name="title" value="${esc(draft.title)}" ${pending ? 'disabled' : ''}></label>`}
  <label>${draft.whole ? 'Markdown' : 'Content'} <textarea class="memo-input" name="body" rows="6" ${pending ? 'disabled' : ''}>${esc(draft.body)}</textarea></label>
  ${draft.whole ? '' : `<div class="inline-palette">${COLOR_PALETTE.map(c => `<button type="button" data-action="color" data-color="${c.value}" class="color-swatch ${draft!.color === c.value ? 'is-active' : ''}" style="--swatch-color:${c.value}" aria-label="${esc(c.label)}" aria-pressed="${draft!.color === c.value}" ${pending ? 'disabled' : ''}></button>`).join('')}</div>`}
  ${draft.conflict ? `<div class="conflict" role="alert">The note changed. Your draft is preserved. ${button('reload', 'Reload latest note', '', !!pending)}</div>` : ''}
  ${draft.orphan ? `<div class="conflict">The edited memo cannot be identified in the latest note. ${button('draft-as-new', 'Save draft as a new memo')}</div>` : ''}
  <div class="form-actions">${button('cancel', 'Cancel', '', !!pending)}<button type="submit" ${pending || draft.conflict || draft.orphan ? 'disabled' : ''}>${pending ? 'Saving...' : 'Save'}</button></div>
 </form></section>`;
}
function render(): void {
 if (!root) return;
 const gridScroll = root.querySelector('.memo-grid')?.scrollTop || 0;
 const detailScroll = root.querySelector('.memo-detail')?.scrollTop || 0;
 const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
 const activeName = active?.name;
 const selection = activeName ? [active?.selectionStart, active?.selectionEnd] : null;
 clearTooltip();
 if (!snapshot) { root.innerHTML = `<div class="empty-state"><h2>JoplinMemo</h2><p>${esc(status || 'Open a note to view memos.')}</p></div>`; return; }
 const selectedMemo = memo() || snapshot.document.memos[0];
 const readMemo = memo(reader);
 root.innerHTML = `<div class="memo-layout ${compact() ? 'is-compact' : 'is-full'}" ${readMemo ? 'inert' : ''} data-display-mode="${compact() ? 'compact' : 'full'}">
  <header class="memo-header"><div class="note-title">${esc(snapshot.document.title)}</div><div class="memo-actions">
   ${snapshot.slides.length ? button('slides', 'Slide') : ''}${button('add', '+ Memo', '', !!pending || !!draft)}${compact() ? button('edit-selected', 'Edit', '', !selectedMemo || !!pending || !!draft) : ''}${button('retry-render', 'Refresh', '', !!pending)}<span class="memo-count">${snapshot.document.memos.length} memos</span>
  </div></header>
  <main class="memo-main"><section class="memo-grid" aria-label="Memos">${formHtml()}${snapshot.document.memos.map(card).join('')}</section>
   ${compact() ? '' : `<aside class="memo-detail" data-id="${selectedMemo?.id || ''}">${selectedMemo ? `<div class="detail-body rendered-markdown">${fullHtml(selectedMemo)}</div>` : ''}</aside>`}
  </main><div class="status" role="status" ${status ? '' : 'hidden'}>${esc(status)}</div>
 </div>${readMemo ? `<section class="reader overlay" data-id="${readMemo.id}" role="dialog" aria-modal="true" aria-label="Read memo"><header class="viewer-toolbar">${button('close-reader', 'Close')}${button('edit', 'Edit', readMemo.id, !!pending || !!draft)}</header><div class="reader-content rendered-markdown">${fullHtml(readMemo)}</div></section>` : ''}`;
 const grid = root.querySelector('.memo-grid'); if (grid) grid.scrollTop = gridScroll;
 const detail = root.querySelector('.memo-detail'); if (detail) detail.scrollTop = detailScroll;
 if (activeName && draft) {
  const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${activeName}"]`);
  input?.focus({ preventScroll: true });
  if (input && selection && selection[0] !== null && selection[0] !== undefined) input.setSelectionRange(selection[0], selection[1] || selection[0]);
 }
}
function accept(event: PluginMessage | { message: PluginMessage }, explicit = false): void {
 window.clearTimeout(openTimer);
 const message = 'message' in event && !('type' in event) ? event.message : event as PluginMessage;
 if (!message || !('type' in message)) return;
 if (message.type !== 'document') {
  if (snapshot && draft) drafts.set(snapshot.document.noteId, draft);
  viewer?.close(); snapshot = null; draft = null; reader = ''; pending = ''; status = message.message; render(); return;
 }
 const sameNote = snapshot?.document.noteId === message.document.noteId;
 const explicitReload = sameNote && allowReload && refreshNoteId === message.document.noteId;
 const sameSource = sameNote && snapshot?.document.original?.markdown === message.document.original?.markdown;
 const renderRefresh = sameSource && refreshOnly && refreshNoteId === message.document.noteId;
 if (sameNote && message.revision < snapshot!.revision) return;
 if (sameNote && message.revision === snapshot!.revision && !explicit) return;
 if (!sameNote) {
  if (snapshot && draft) drafts.set(snapshot.document.noteId, draft);
  viewer?.close(); reader = ''; selected = ''; pending = '';
  draft = drafts.get(message.document.noteId) || null;
  if (draft) draft.conflict = true;
 }
 if (draft && sameNote && !message.operationId && !explicitReload && !renderRefresh) draft.conflict = true;
 snapshot = message;
 presentations.clear();
 if (draft && explicitReload) {
  draft.revision = message.revision; draft.conflict = false;
  draft.orphan = !!draft.memoId && !message.document.memos.some(m => m.id === draft!.memoId);
 }
 if (draft && renderRefresh && !draft.conflict) draft.revision = message.revision;
 if (message.selectedMemoId && memo(message.selectedMemoId)) selected = message.selectedMemoId;
 if (!memo()) selected = message.document.memos[0]?.id || '';
 if (reader && !memo(reader)) reader = '';
 status = draft?.conflict ? 'Note changed; reload before saving the draft.' : '';
 render();
}
function edit(id?: string): void {
 window.clearTimeout(openTimer);
 if (pending || !snapshot) return;
 if (draft) { status = 'Save or cancel the current draft first.'; render(); return; }
 const m = id ? memo(id) : undefined;
 draft = { memoId: m?.id, title: m?.title || '', body: m?.body || '', color: m?.color || DEFAULT_MEMO_COLOR, revision: snapshot.revision, whole: !!m?.original?.whole, conflict: false, orphan: false };
 reader = ''; clearTooltip(); render();
 root.querySelector<HTMLElement>('.memo-input')?.focus();
}
async function mutate(fields: Omit<Mutation, 'noteId' | 'revision' | 'operationId'>): Promise<void> {
 if (!snapshot || pending) return;
 const noteId = snapshot.document.noteId;
 const submittedDraft = draft;
 const operationId = `op-${Date.now()}-${++operation}`;
 pending = operationId; status = 'Saving...'; render();
 try {
  const result = await webviewApi.postMessage({ ...fields, noteId, revision: draft?.revision ?? snapshot.revision, operationId }) as MutationResult;
  if (snapshot?.document.noteId !== noteId || pending !== operationId) {
   if (result?.type === 'document' && submittedDraft && drafts.get(noteId) === submittedDraft && draft !== submittedDraft) drafts.delete(noteId);
   return;
  }
  pending = '';
  if (result?.type === 'document') {
   // A newer host update has already arrived: do not replace it with the save response.
   if (result.revision < snapshot.revision) { if (draft) draft.conflict = true; status = 'Note changed during save. Reload to review it.'; render(); return; }
   if (fields.type !== 'reorderMemos') { draft = null; drafts.delete(noteId); }
   accept(result, true);
  } else {
   if (result?.type === 'mutationError' && result.code === 'conflict' && draft) draft.conflict = true;
   status = result?.type === 'mutationError' ? result.message : 'Save failed. Please try again.';
   render();
  }
 } catch (error) {
  if (snapshot?.document.noteId === noteId && pending === operationId) { pending = ''; status = error instanceof Error ? error.message : 'Save failed. Please try again.'; render(); }
 }
}
async function refresh(reload = false): Promise<void> {
 if (refreshNoteId || pending) return;
 refreshNoteId = snapshot?.document.noteId || '';
 allowReload = reload; refreshOnly = !reload;
 try { const response = await webviewApi.postMessage({ type: reload ? 'reload' : 'retryRender' }) as PluginMessage; if (response?.type) accept(response, true); }
 catch (error) { status = error instanceof Error ? error.message : 'Refresh failed.'; render(); }
 finally { allowReload = false; refreshOnly = false; refreshNoteId = ''; }
}
function slides(): ViewerImage[] { return snapshot?.slides.map(s => ({ ...(firstImage(s.imageHtml) || { src: '', alt: s.alt }), caption: s.captionHtml, error: s.error })) || []; }
function showImage(img: HTMLImageElement): void {
 viewer?.close();
 const image = { src: img.getAttribute('src') || '', alt: img.alt, caption: '' };
 const noteId = snapshot?.document.noteId;
 const ownerId = img.closest<HTMLElement>('.memo-card')?.dataset.id || img.closest<HTMLElement>('.memo-tip')?.dataset.ownerId || reader || selected;
 const imagesInMemo = (): ViewerImage[] => {
  const template = document.createElement('template');
  template.innerHTML = safeHtml(snapshot?.rendered[ownerId]?.full || '');
  return Array.from(template.content.querySelectorAll('img')).map(node => ({ src: node.getAttribute('src') || '', alt: node.alt, caption: '' }));
 };
 const index = Math.max(0, imagesInMemo().findIndex(item => item.src === image.src));
 viewer = new ImageViewer([image], false, () => { viewer = null; }, async () => {
  await refresh();
  if (noteId !== snapshot?.document.noteId) return [];
  return [imagesInMemo()[index] || image];
 });
 viewer.open();
}
function showSlides(): void {
 if (!snapshot?.slides.length) return;
 viewer?.close(); clearTooltip();
 const noteId = snapshot.document.noteId;
 viewer = new ImageViewer(slides(), true, () => { viewer = null; }, async () => { await refresh(); return snapshot?.document.noteId === noteId ? slides() : []; });
 viewer.open();
}
function closeReader(): void {
 reader = ''; render();
 root.querySelector<HTMLElement>(`.memo-select[data-id="${returnFocusId}"]`)?.focus({ preventScroll: true });
}
async function click(event: MouseEvent): Promise<void> {
 window.clearTimeout(openTimer);
 const target = event.target as HTMLElement;
 const anchor = target.closest<HTMLAnchorElement>('a');
 if (anchor) {
  event.preventDefault(); event.stopPropagation();
  const resource = anchor.getAttribute('data-resource-id');
  const href = resource ? `:/${resource}` : anchor.getAttribute('href') || '';
  if (/^(https?:|mailto:|:\/)/i.test(href)) {
   try { await webviewApi.postMessage({ type: 'openLink', href }); } catch (_) { status = 'Could not open link.'; render(); }
  }
  return;
 }
 const img = target.closest<HTMLImageElement>('img');
 if (img) {
  event.preventDefault();
  if (event.detail < 2) openTimer = window.setTimeout(() => { if (img.isConnected) showImage(img); }, 250);
  return;
 }
 const actionTarget = target.closest<HTMLElement>('[data-action]');
 if (!actionTarget) return;
 const action = actionTarget.dataset.action;
 const id = actionTarget.dataset.id || '';
 if (action === 'select') {
  if (event.detail >= 2) return;
  const select = () => {
  selected = id;
  if (compact()) { reader = id; returnFocusId = id; }
  if (reader) { render(); root.querySelector<HTMLElement>('[data-action="close-reader"]')?.focus(); }
  else {
   clearTooltip();
   root.querySelectorAll<HTMLElement>('.memo-card').forEach(card => card.classList.toggle('is-selected', card.dataset.id === id));
   const detail = root.querySelector<HTMLElement>('.memo-detail');
   const selectedMemo = memo(id);
   if (detail && selectedMemo) {
    detail.dataset.id = id;
    detail.innerHTML = `<div class="detail-body rendered-markdown">${fullHtml(selectedMemo)}</div>`;
    detail.scrollTop = 0;
   }
  }
  };
  if (compact() && event.detail) openTimer = window.setTimeout(select, 250);
  else select();
 }
 if (action === 'close-reader') closeReader();
 if (action === 'add') edit();
 if (action === 'edit-selected' && memo()) edit(selected);
 if (action === 'edit' && memo(id)) edit(id);
 if (action === 'cancel' && !pending) { draft = null; if (snapshot) drafts.delete(snapshot.document.noteId); status = ''; render(); }
 if (action === 'color' && draft && !pending) { draft.color = actionTarget.dataset.color || DEFAULT_MEMO_COLOR; render(); }
 if (action === 'slides') showSlides();
 if (action === 'reload') await refresh(true);
 if (action === 'retry-render') await refresh();
 if (action === 'draft-as-new' && draft) { draft.memoId = undefined; draft.orphan = false; draft.whole = false; render(); }
}
function clearTooltip(): void { window.clearTimeout(tooltipTimer); document.querySelector('.memo-tip')?.remove(); }
function setupTooltip(): void {
 root.addEventListener('mouseover', event => {
  if (mobile() || draft || reader || viewer) return;
  const card = (event.target as HTMLElement).closest<HTMLElement>('.memo-card');
  if (!card?.dataset.id || (card.dataset.id === selected && !compact()) || card.contains(event.relatedTarget as Node | null)) return;
  clearTooltip();
  const m = memo(card.dataset.id); if (!m) return;
  tooltipTimer = window.setTimeout(() => {
   if (!card.isConnected || draft || reader || viewer) return;
   const tip = document.createElement('div'); tip.className = 'memo-tip rendered-markdown'; tip.dataset.ownerId = m.id; tip.innerHTML = fullHtml(m);
   const rect = card.getBoundingClientRect();
   tip.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 368))}px`;
   if (window.innerHeight - rect.bottom > 180) tip.style.top = `${rect.bottom}px`; else tip.style.bottom = `${window.innerHeight - rect.top}px`;
   root.appendChild(tip);
  }, 180);
 });
 root.addEventListener('mouseout', event => {
  const source = (event.target as HTMLElement).closest('.memo-card,.memo-tip');
  const related = event.relatedTarget as HTMLElement | null;
  if (source && !source.contains(related) && !related?.closest?.('.memo-tip')) clearTooltip();
 });
 root.addEventListener('wheel', event => { if (!(event.target as HTMLElement).closest('.memo-tip')) clearTooltip(); }, { passive: true });
 root.addEventListener('scroll', event => { if (!(event.target as HTMLElement).closest('.memo-tip')) clearTooltip(); }, true);
}
function setupDrag(): void {
 root.addEventListener('dragstart', event => {
  window.clearTimeout(openTimer);
  const card = (event.target as HTMLElement).closest<HTMLElement>('.memo-card');
  if (!card?.dataset.id || draft || pending || memo(card.dataset.id)?.source === 'abstract') { event.preventDefault(); return; }
  dragged = card.dataset.id; event.dataTransfer?.setData('text/plain', dragged); clearTooltip();
 });
 root.addEventListener('dragend', () => { dragged = ''; });
 root.addEventListener('dragover', event => { if (dragged && (event.target as HTMLElement).closest('.memo-card')) event.preventDefault(); });
 root.addEventListener('drop', event => {
  event.preventDefault();
  const card = (event.target as HTMLElement).closest<HTMLElement>('.memo-card');
  const targetId = card?.dataset.id;
  if (!card || !targetId || !dragged || targetId === dragged || !snapshot || memo(targetId)?.source === 'abstract') return;
  const ids = snapshot.document.memos.map(m => m.id).filter(id => id !== dragged);
  const rect = card.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, dragged); selected = dragged; dragged = '';
  void mutate({ type: 'reorderMemos', memoIds: ids, memoId: selected });
 });
}
async function start(): Promise<void> {
 if (!root) return;
 webviewApi.onMessage(accept);
 root.addEventListener('error', event => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.failed) return;
  img.dataset.failed = 'true';
  const retry = document.createElement('button'); retry.type = 'button'; retry.dataset.action = 'retry-render'; retry.textContent = 'Image unavailable - Retry';
  img.after(retry);
 }, true);
 root.addEventListener('click', event => { void click(event); });
 root.addEventListener('focusin', event => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('.memo-select');
  if (!compact() || !card?.dataset.id || reader || draft) return;
  selected = card.dataset.id;
  root.querySelectorAll<HTMLElement>('.memo-card').forEach(item => item.classList.toggle('is-selected', item.dataset.id === selected));
 });
 root.addEventListener('input', event => {
  if (!draft) return;
  const input = event.target as HTMLInputElement;
  if (input.name === 'title') draft.title = input.value;
  if (input.name === 'body') draft.body = input.value;
 });
 root.addEventListener('submit', event => {
  event.preventDefault();
  if (!draft || pending || draft.conflict || draft.orphan) return;
  if (!draft.whole && !draft.title.trim() && !draft.body.trim()) { status = 'Enter memo content first.'; render(); return; }
  void mutate({ type: draft.memoId ? 'editMemo' : 'addMemo', memoId: draft.memoId, title: draft.title, body: draft.body, color: draft.color });
 });
 root.addEventListener('dblclick', event => {
  const target = event.target as HTMLElement;
  if (target.closest('a,button,input,textarea')) return;
  const id = target.closest<HTMLElement>('.memo-card,.memo-detail,.reader')?.dataset.id;
  if (id) { event.preventDefault(); edit(id); }
 });
 root.addEventListener('keydown', event => {
  if (viewer) return;
  if (event.key === 'F2' && !draft) { event.preventDefault(); edit(reader || selected); }
  if (event.key === 'Escape') { if (reader) closeReader(); else if (draft && !pending) { draft = null; if (snapshot) drafts.delete(snapshot.document.noteId); status = ''; render(); } }
  if ((event.key === 'Enter' || event.key === ' ') && (event.target as HTMLElement).matches('.memo-select')) { event.preventDefault(); (event.target as HTMLElement).click(); }
  if (event.key === 'Tab' && reader) {
   const elements = Array.from(root.querySelectorAll<HTMLElement>('.reader button,.reader a[href]'));
   if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements[elements.length - 1]?.focus(); }
   else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) { event.preventDefault(); elements[0]?.focus(); }
  }
 });
 window.addEventListener('blur', () => viewer?.pause());
 setupTooltip(); setupDrag();
 try { const initial = await webviewApi.postMessage({ type: 'ready' }) as PluginMessage; if (initial?.type) accept(initial); }
 catch (error) { status = error instanceof Error ? error.message : 'Could not open memos.'; render(); }
}
void start();
