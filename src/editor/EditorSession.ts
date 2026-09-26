import { DEFAULT_MEMO_COLOR, DocumentMessage, Memo, Mutation, MutationResult, MemoDocument } from '../memo/types';
import { newMemoId, parseMemoDocument, reconcileMemoIds } from '../memo/parseMemoDocument';
import { serializeMemoDocument } from '../memo/serializeMemoDocument';

export type NoteData = { id: string; title: string; body: string; markupLanguage: number };
export type SessionPort = {
 read: (id: string) => Promise<NoteData>;
 save: (id: string, body: string, previousBody: string) => Promise<void>;
 render: (document: MemoDocument, source: string) => Promise<Pick<DocumentMessage, 'rendered' | 'slides' | 'resourcePaths'>>;
 publish: (message: DocumentMessage | { type: 'empty' | 'error'; message: string }) => void;
};
export function unsupported(note: NoteData): string {
 if (note.markupLanguage === 2) return 'HTML notes are not shown as memos.';
 if (/(^|\n)[ \t]*(`{3,}|~{3,})kanban(?:-settings)?(?:\s|$)/i.test(note.body)) return 'Kanban notes are not shown as memos.';
 return '';
}
type State = { note: NoteData; source: string; storedBody: string; document: MemoDocument; message: DocumentMessage };
export class EditorSession {
 private state: State | null = null;
 private generation = 0;
 private revision = 0;
 private loading = false;
 private queue: Promise<unknown> = Promise.resolve();
 private completed = new Map<string, MutationResult>();
 constructor(private port: SessionPort) {}
 get current(): DocumentMessage | null { return this.state?.message || null; }
 clear(): void { this.generation++; this.loading = false; this.state = null; this.port.publish({ type: 'empty', message: 'No note is selected.' }); }
 async load(noteId: string, body?: string): Promise<void> {
  const generation = ++this.generation;
  this.loading = true;
  try {
   const note = await this.port.read(noteId);
   if (generation !== this.generation) return;
   const source = body === undefined ? note.body : body;
   const reason = unsupported({ ...note, body: source });
   if (reason) { this.state = null; this.port.publish({ type: 'empty', message: reason }); return; }
   const document = parseMemoDocument(noteId, note.title, source);
   if (this.state) reconcileMemoIds(document, this.state.document);
   const revision = ++this.revision;
   const message: DocumentMessage = { type: 'document', document, revision, ...await this.port.render(document, source) };
   if (generation !== this.generation) return;
   this.state = { note, source, storedBody: note.body, document, message };
   this.port.publish(message);
  } catch (error) {
   if (generation === this.generation) { this.state = null; this.port.publish({ type: 'error', message: error instanceof Error ? error.message : 'Could not read note.' }); }
  } finally { if (generation === this.generation) this.loading = false; }
 }
 mutate(message: Mutation): Promise<MutationResult> {
  const task = this.queue.then(() => this.perform(message));
  this.queue = task.catch(() => undefined);
  return task;
 }
 private async perform(message: Mutation): Promise<MutationResult> {
  const fail = (code: 'conflict' | 'invalid' | 'save', text: string): MutationResult => ({ type: 'mutationError', operationId: message?.operationId || '', code, message: text });
  if (!message || typeof message.operationId !== 'string' || !message.operationId) return fail('invalid', 'Invalid operation.');
  const key = `${message.noteId}:${message.operationId}`;
  const completed = this.completed.get(key);
  if (completed) return completed;
  const state = this.state;
  const generation = this.generation;
  if (this.loading || !state || message.noteId !== state.note.id || message.revision !== state.message.revision) return fail('conflict', 'This note changed. Reload before applying your draft.');
  const document = { ...state.document, memos: [...state.document.memos] };
  let selectedMemoId = message.memoId;
  if (message.type === 'reorderMemos') {
   const ids = message.memoIds;
   if (!Array.isArray(ids) || ids.length !== document.memos.length || new Set(ids).size !== ids.length || ids.some(id => !document.memos.some(m => m.id === id))) return fail('invalid', 'Invalid memo order.');
   if (document.rule.type === 'abstract-heading' && ids[0] !== document.memos.find(m => m.source === 'abstract')?.id) return fail('invalid', 'The abstract must remain first.');
   document.memos = ids.map(id => document.memos.find(m => m.id === id)!);
  } else if (message.type === 'addMemo' || message.type === 'editMemo') {
   if (typeof message.title !== 'string' || typeof message.body !== 'string' || typeof message.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(message.color) || /[\r\n]/.test(message.title)) return fail('invalid', 'Enter a single-line title and a valid colour.');
   if (message.type === 'editMemo') {
    const index = document.memos.findIndex(m => m.id === message.memoId);
    if (index < 0) return fail('invalid', 'This memo no longer exists.');
    const old = document.memos[index];
    document.memos[index] = { ...old, title: old.original?.whole ? old.title : message.title, body: message.body, color: old.original?.whole ? old.color : message.color.toLowerCase() };
   } else {
    const type = document.rule.type;
    const source: Memo['source'] = type === 'heading' || type === 'abstract-heading' ? 'heading' : type === 'separator-section' ? 'separator-section' : type === 'block' ? 'block' : type === 'reverse-number-slash' ? 'reverse-number-list' : 'list';
    const memo: Memo = { id: newMemoId(), title: message.title || 'New memo', body: message.body, color: message.color || DEFAULT_MEMO_COLOR, source };
    document.memos.splice(type === 'abstract-heading' ? 1 : 0, 0, memo);
    selectedMemoId = memo.id;
   }
  } else return fail('invalid', 'Unknown operation.');
  try {
   const latest = await this.port.read(state.note.id);
   if (this.generation !== generation || this.state !== state || latest.body !== state.storedBody || unsupported(latest)) return fail('conflict', 'This note changed elsewhere. Your draft is preserved; reload before saving.');
   const source = serializeMemoDocument(document);
   await this.port.save(state.note.id, source, latest.body);
   const parsed = parseMemoDocument(state.note.id, latest.title, source);
   if (parsed.memos.length === document.memos.length) parsed.memos.forEach((memo, index) => { memo.id = document.memos[index].id; });
   else reconcileMemoIds(parsed, document);
   if (parsed.original) parsed.original.ids = parsed.memos.map(m => m.id);
   const result: DocumentMessage = { type: 'document', document: parsed, revision: ++this.revision, operationId: message.operationId, selectedMemoId, ...await this.port.render(parsed, source) };
   if (this.completed.size > 100) this.completed.delete(this.completed.keys().next().value as string);
   this.completed.set(key, result);
   if (this.generation === generation && this.state === state) this.state = { note: { ...latest, body: source }, source, storedBody: source, document: parsed, message: result };
   return result;
  } catch (error) { return fail('save', error instanceof Error ? error.message : 'Save failed. Please try again.'); }
 }
}
