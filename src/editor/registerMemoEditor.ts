import joplin from 'api';
import { ViewHandle } from 'api/types';
import { DEFAULT_MEMO_COLOR, Memo, MemoDocument } from '../memo/types';
import { parseMemoDocument } from '../memo/parseMemoDocument';
import { serializeMemoDocument } from '../memo/serializeMemoDocument';

type EditorState = {
	noteId: string;
	body: string;
	title: string;
	markupLanguage: number;
	document: MemoDocument;
	resourcePaths: Record<string, string>;
};

type ViewContext = {
	state: EditorState | null;
	ready: boolean;
	emptyMessage: string;
};

type WebviewMessage =
	| { type: 'ready' }
	| { type: 'reorderMemos'; noteId: string; memoIds: string[] }
	| { type: 'addMemo'; noteId: string; title: string; body: string; color: string }
	| { type: 'editMemo'; noteId: string; memoId: string; title: string; body: string; color: string };

const EDITOR_VIEW_ID = 'joplinmemo-viewer';
const OPEN_COMMAND = 'joplinmemoOpenViewer';
const MARKUP_LANGUAGE_HTML = 2;
const viewContexts = new Map<ViewHandle, ViewContext>();

type NoteData = {
	id: string;
	title: string;
	body: string;
	markupLanguage: number;
};

function editorHtml(): string {
	return '<!doctype html>\n' +
		'<html>\n' +
		'<head>\n' +
		'<meta charset="utf-8">\n' +
		'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
		'</head>\n' +
		'<body>\n' +
		'<div id="app" class="app-shell">\n' +
		'<div class="loading">Loading memos...</div>\n' +
		'</div>\n' +
		'</body>\n' +
		'</html>';
}

function contextFor(handle: ViewHandle): ViewContext {
	let context = viewContexts.get(handle);
	if (!context) {
		context = {
			state: null,
			ready: false,
			emptyMessage: '',
		};
		viewContexts.set(handle, context);
	}

	return context;
}

async function loadNote(noteId: string): Promise<NoteData> {
	const note = await joplin.data.get(['notes', noteId], { fields: ['id', 'title', 'body', 'markup_language'] });
	return {
		id: String(note.id || noteId),
		title: typeof note.title === 'string' ? note.title : '',
		body: typeof note.body === 'string' ? note.body : '',
		markupLanguage: Number(note.markup_language || 1),
	};
}

function isKanbanNote(body: string): boolean {
	return /(^|\n)```kanban(?:\s|\n)/i.test(body) || /(^|\n)```kanban-settings(?:\s|\n)/i.test(body);
}

function unsupportedNoteMessage(note: NoteData): string {
	if (note.markupLanguage === MARKUP_LANGUAGE_HTML) return 'HTML notes are not shown as memos.';
	if (isKanbanNote(note.body)) return 'Kanban notes are not shown as memos.';
	return '';
}

function resourceIdsInDocument(document: MemoDocument): string[] {
	const ids = new Set<string>();
	for (const memo of document.memos) {
		const text = `${memo.title}\n${memo.body}`;
		const resourcePattern = /!\[[^\]]*\]\(:\/([A-Za-z0-9]+)(?:\s+["'][^"']*["'])?\)/g;
		let match: RegExpExecArray | null = resourcePattern.exec(text);
		while (match) {
			ids.add(match[1]);
			match = resourcePattern.exec(text);
		}
	}
	return Array.from(ids);
}

function fileUrl(path: string): string {
	const normalized = path.replace(/\\/g, '/');
	const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`;
	const segments = prefixed.split('/').map((segment, index) => {
		if (index === 1 && /^[A-Za-z]:$/.test(segment)) return segment;
		return encodeURIComponent(segment);
	});
	return `file://${segments.join('/')}`;
}

async function resolveResourcePaths(document: MemoDocument): Promise<Record<string, string>> {
	const resourcePaths: Record<string, string> = {};
	for (const resourceId of resourceIdsInDocument(document)) {
		try {
			resourcePaths[resourceId] = fileUrl(await joplin.data.resourcePath(resourceId));
		} catch (error) {
			console.warn(`Could not resolve JoplinMemo resource ${resourceId}:`, error);
		}
	}
	return resourcePaths;
}

async function createEditorState(note: NoteData, body: string = note.body): Promise<EditorState> {
	const document = parseMemoDocument(note.id, note.title, body);
	return {
		noteId: note.id,
		title: note.title,
		body,
		markupLanguage: note.markupLanguage,
		document,
		resourcePaths: await resolveResourcePaths(document),
	};
}

function postDocument(handle: ViewHandle, state: EditorState): void {
	contextFor(handle).emptyMessage = '';
	joplin.views.editors.postMessage(handle, {
		type: 'document',
		document: state.document,
		resourcePaths: state.resourcePaths,
	});
}

function postEmpty(handle: ViewHandle, message: string): void {
	contextFor(handle).emptyMessage = message;
	joplin.views.editors.postMessage(handle, {
		type: 'empty',
		message,
	});
}

function postError(handle: ViewHandle, message: string): void {
	contextFor(handle).emptyMessage = '';
	joplin.views.editors.postMessage(handle, {
		type: 'error',
		message,
	});
}

function normalizeMemoText(value: string, fallback: string): string {
	const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
	return normalized || fallback;
}

function isColor(value: string): boolean {
	return /^#[0-9a-fA-F]{6}$/.test(value);
}

function newMemo(source: Memo['source'], title: string, body: string, color: string): Memo {
	return {
		id: `memo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
		title: normalizeMemoText(title, 'New memo'),
		body: normalizeMemoText(body, ''),
		color: isColor(color) ? color.toLowerCase() : DEFAULT_MEMO_COLOR,
		source,
	};
}

async function saveDocument(handle: ViewHandle, context: ViewContext, document: MemoDocument): Promise<void> {
	if (!context.state) return;

	const body = serializeMemoDocument(document);
	await joplin.views.editors.saveNote(handle, {
		noteId: context.state.noteId,
		body,
	});

	context.state = await createEditorState({
		id: context.state.noteId,
		title: context.state.title,
		body,
		markupLanguage: context.state.markupLanguage,
	}, body);
}

async function updateView(handle: ViewHandle, noteId: string, body: string): Promise<void> {
	const context = contextFor(handle);

	try {
		const note = await loadNote(noteId);
		const unsupportedMessage = unsupportedNoteMessage({
			...note,
			body,
		});
		if (unsupportedMessage) {
			context.state = null;
			if (context.ready) postEmpty(handle, unsupportedMessage);
			return;
		}

		if (context.state?.noteId === noteId && context.state.body === body && context.state.title === note.title) {
			return;
		}

		const state = await createEditorState(note, body);
		context.state = state;
		if (context.ready) postDocument(handle, state);
	} catch (error) {
		context.state = null;
		if (context.ready) {
			postError(handle, error instanceof Error ? error.message : 'Could not read this note as memos.');
		}
	}
}

async function handleWebviewMessage(handle: ViewHandle, message: WebviewMessage): Promise<unknown> {
	if (!message) return { ok: false };

	const context = contextFor(handle);

	if (message.type === 'ready') {
		context.ready = true;

		if (!context.state) {
			const note = await joplin.workspace.selectedNote();
			if (note?.id) {
				const noteId = String(note.id);
				const body = typeof note.body === 'string' ? note.body : (await loadNote(noteId)).body;
				await updateView(handle, noteId, body);
			}
		}

		return context.state
			? { ok: true, type: 'document', document: context.state.document, resourcePaths: context.state.resourcePaths }
			: { ok: true, type: 'empty', message: context.emptyMessage || 'Open a note to view memos.' };
	}

	if (!context.state || message.noteId !== context.state.noteId) return { ok: false };

	if (message.type === 'reorderMemos') {
		const byId = new Map(context.state.document.memos.map(memo => [memo.id, memo]));
		const reordered = message.memoIds.map(id => byId.get(id)).filter((memo): memo is Memo => !!memo);
		if (reordered.length !== context.state.document.memos.length) return { ok: false };

		await saveDocument(handle, context, {
			...context.state.document,
			memos: reordered,
		});
		return { ok: true, type: 'document', document: context.state.document };
	}

	if (message.type === 'addMemo') {
		const source = context.state.document.rule.type === 'block'
			? 'block'
			: context.state.document.rule.type === 'heading'
				? 'heading'
				: context.state.document.rule.type === 'reverse-number-slash'
					? 'reverse-number-list'
					: 'list';
		await saveDocument(handle, context, {
			...context.state.document,
			memos: [newMemo(source, message.title, message.body, message.color), ...context.state.document.memos],
		});
		return { ok: true, type: 'document', document: context.state.document };
	}

	if (message.type === 'editMemo') {
		await saveDocument(handle, context, {
			...context.state.document,
			memos: context.state.document.memos.map(memo => memo.id === message.memoId
				? {
					...memo,
					title: normalizeMemoText(message.title, memo.title || 'Untitled memo'),
					body: normalizeMemoText(message.body, ''),
					color: isColor(message.color) ? message.color.toLowerCase() : DEFAULT_MEMO_COLOR,
				}
				: memo),
		});
		return { ok: true, type: 'document', document: context.state.document };
	}

	return { ok: false };
}

async function setupMemoEditor(handle: ViewHandle): Promise<void> {
	const editors = joplin.views.editors;
	contextFor(handle);

	await editors.setHtml(handle, editorHtml());
	await editors.addScript(handle, './webview/styles.css');

	await editors.onUpdate(handle, async event => {
		if (!event.noteId) {
			const context = contextFor(handle);
			context.state = null;
			context.emptyMessage = 'No note is selected.';
			postEmpty(handle, 'No note is selected.');
			return;
		}

		await updateView(handle, event.noteId, event.newBody);
	});

	await editors.onMessage(handle, async (message: WebviewMessage) => handleWebviewMessage(handle, message));
	await editors.addScript(handle, './webview/app.js');
}

export async function registerMemoEditor(): Promise<string> {
	await joplin.commands.register({
		name: OPEN_COMMAND,
		label: 'View as memos / Back to default view',
		iconName: 'fas fa-sticky-note',
		execute: async () => {
			await joplin.commands.execute('toggleEditorPlugin');
		},
	});

	await joplin.views.editors.register(EDITOR_VIEW_ID, {
		onActivationCheck: async event => {
			if (!event.noteId) return false;
			try {
				const note = await loadNote(event.noteId);
				return !unsupportedNoteMessage(note);
			} catch (error) {
				console.warn('Could not check whether JoplinMemo should activate:', error);
				return false;
			}
		},
		onSetup: setupMemoEditor,
	});

	return OPEN_COMMAND;
}
