import joplin from 'api';
import { ViewHandle } from 'api/types';
import { EditorSession, NoteData, unsupported } from './EditorSession';
import { clearRenderCache, renderDocument } from './renderDocument';
import { WebviewMessage } from '../memo/types';
import { confirmSavedBody } from './saveConfirmation';

type View = { session: EditorSession; ready: boolean; noteId: string; body?: string; updateVersion: number };
const views = new Map<ViewHandle, View>();
const OPEN_COMMAND = 'joplinmemoOpenViewer';
async function loadNote(id: string): Promise<NoteData> {
 const note = await joplin.data.get(['notes', id], { fields: ['id', 'title', 'body', 'markup_language'] });
 return { id: String(note.id || id), title: String(note.title || ''), body: String(note.body || ''), markupLanguage: Number(note.markup_language || 1) };
}
async function setup(handle: ViewHandle): Promise<void> {
 const editors = joplin.views.editors;
 const view: View = { ready: false, noteId: '', updateVersion: 0, session: new EditorSession({ read: loadNote,
  save: async (noteId, body, previousBody) => {
   await editors.saveNote(handle, { noteId, body });
   await confirmSavedBody(() => loadNote(noteId).then(note => note.body), body, previousBody);
  }, render: renderDocument,
  publish: message => { if (view.ready) editors.postMessage(handle, message); },
 }) };
 views.set(handle, view);
 await editors.setHtml(handle, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app" class="app-shell"><div class="loading">Loading memos...</div></div></body></html>');
 await editors.addScript(handle, './webview/styles.css');
 await editors.onUpdate(handle, async event => {
  view.updateVersion++;
  view.noteId = event.noteId || '';
  view.body = event.newBody;
  if (!view.noteId) view.session.clear();
  else await view.session.load(view.noteId, event.newBody);
 });
 await editors.onMessage(handle, async (message: WebviewMessage) => {
  if (!message || typeof message !== 'object') return { type: 'error', message: 'Invalid message.' };
  if (message.type === 'openLink') {
   if (typeof message.href === 'string' && /^(https?:|mailto:|:\/[a-f0-9]{32}$)/i.test(message.href)) await joplin.commands.execute('openItem', message.href);
   return { ok: true };
  }
  if (message.type === 'ready' || message.type === 'reload' || message.type === 'retryRender') {
   view.ready = true;
   if (message.type !== 'ready') clearRenderCache();
   if (message.type === 'ready' || !view.noteId) {
    const updateVersion = view.updateVersion;
    const note = await joplin.workspace.selectedNote();
    if (view.updateVersion === updateVersion) {
     view.noteId = note?.id ? String(note.id) : '';
     view.body = typeof note?.body === 'string' ? note.body : undefined;
    }
   }
   if (!view.noteId) { view.session.clear(); return { type: 'empty', message: 'No note is selected.' }; }
   await view.session.load(view.noteId, message.type === 'reload' ? undefined : view.body);
   if (view.session.current?.document.noteId === view.noteId) view.body = view.session.current.document.original?.markdown;
   return view.session.current || { ok: true };
  }
  if (message.type !== 'addMemo' && message.type !== 'editMemo' && message.type !== 'reorderMemos') return { ok: false };
  const result = await view.session.mutate(message);
  if (result.type === 'document' && view.noteId === result.document.noteId && view.session.current?.operationId === result.operationId) view.body = result.document.original?.markdown;
  return result;
 });
 await editors.addScript(handle, './webview/app.js');
}
export async function registerMemoEditor(): Promise<string> {
 await joplin.commands.register({ name: OPEN_COMMAND, label: 'View as memos / Back to default view', iconName: 'fas fa-sticky-note', execute: () => joplin.commands.execute('toggleEditorPlugin') });
 await joplin.views.editors.register('joplinmemo-viewer', {
  onSetup: setup,
  onActivationCheck: async event => {
   if (!event.noteId) return false;
   try { return !unsupported(await loadNote(event.noteId)); } catch (_) { return false; }
  },
 });
 // A sync may download a previously missing image without changing the note body.
 await joplin.workspace.onSyncComplete(async () => {
  clearRenderCache();
  for (const [handle, view] of views) {
   try {
    if (view.ready && view.noteId && await joplin.views.editors.isVisible(handle)) await view.session.load(view.noteId, view.body);
   } catch (_) { views.delete(handle); }
  }
 });
 await joplin.workspace.onResourceChange(async () => { clearRenderCache(); });
 return OPEN_COMMAND;
}
