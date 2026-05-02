import { COLOR_PALETTE, DEFAULT_MEMO_COLOR, Memo, MemoDocument } from '../memo/types';

type WebviewApi = {
	postMessage: (message: unknown) => Promise<unknown>;
	onMessage: (callback: (event: PluginMessageEvent | PluginMessage) => void) => void;
};

type PluginMessage =
	| { type: 'document'; document: MemoDocument; resourcePaths?: Record<string, string> }
	| { type: 'empty'; message: string }
	| { type: 'error'; message: string };

type PluginMessageEvent = {
	message: PluginMessage;
};

declare const webviewApi: WebviewApi;

let memoDocument: MemoDocument | null = null;
let selectedMemoId = '';
let emptyText = '';
let errorText = '';
let draggedMemoId = '';
let statusText = '';
let isAddingMemo = false;
let addMemoColor = DEFAULT_MEMO_COLOR;
let editingMemoId = '';
let editMemoColor = DEFAULT_MEMO_COLOR;
let tooltipMemoId = '';
let tooltipTimer: number | undefined;
let tooltipLeft = 0;
let tooltipTop = 0;
let tooltipBottom = 0;
let tooltipMaxHeight = 320;
let tooltipPlacement: 'above' | 'below' = 'below';
let resourcePaths: Record<string, string> = {};

const root = document.getElementById('app');
const TOOLTIP_DELAY_MS = 120;

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function excerpt(value: string): string {
	return value
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/[#>*_`[\]()-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function selectedMemo(): Memo | null {
	if (!memoDocument) return null;
	return memoDocument.memos.find(memo => memo.id === selectedMemoId) || memoDocument.memos[0] || null;
}

function isShortMemo(memo: Memo): boolean {
	return !memo.body.trim();
}

function isCompactDocument(document: MemoDocument): boolean {
	return document.memos.length > 0 && document.memos.every(isShortMemo);
}

function memoById(memoId: string): Memo | null {
	if (!memoDocument) return null;
	return memoDocument.memos.find(memo => memo.id === memoId) || null;
}

function isMobileView(): boolean {
	return window.matchMedia('(pointer: coarse), (max-width: 780px)').matches;
}

function renderInlineMarkdown(value: string): string {
	let html = escapeHtml(value);
	html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_match, alt: string, rawSrc: string) => {
		const src = resolveImageSrc(rawSrc);
		if (!src) return '';
		return `<img class="memo-image" src="${escapeHtml(src)}" alt="${alt}">`;
	});
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
	html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
	return html;
}

function resolveImageSrc(rawSrc: string): string {
	const src = rawSrc.replace(/&amp;/g, '&').trim();
	const resourceMatch = /^:\/([A-Za-z0-9]+)$/.exec(src);
	if (resourceMatch) return resourcePaths[resourceMatch[1]] || '';
	if (/^(https?:|file:|data:image\/)/i.test(src)) return src;
	return '';
}

function renderMarkdown(markdown: string): string {
	const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
	const html: string[] = [];
	let inFence = false;
	let codeLines: string[] = [];
	let listType: 'ul' | 'ol' | '' = '';

	const closeList = () => {
		if (!listType) return;
		html.push(`</${listType}>`);
		listType = '';
	};

	for (const line of lines) {
		if (/^(```|~~~)/.test(line.trim())) {
			if (inFence) {
				html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
				codeLines = [];
			} else {
				closeList();
			}
			inFence = !inFence;
			continue;
		}

		if (inFence) {
			codeLines.push(line);
			continue;
		}

		if (!line.trim()) {
			closeList();
			continue;
		}

		const heading = /^(#{1,6})\s+(.+)$/.exec(line);
		if (heading) {
			closeList();
			const level = Math.min(heading[1].length + 2, 6);
			html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
			continue;
		}

		const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
		if (unordered) {
			if (listType !== 'ul') {
				closeList();
				html.push('<ul>');
				listType = 'ul';
			}
			html.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);
			continue;
		}

		const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
		if (ordered) {
			if (listType !== 'ol') {
				closeList();
				html.push('<ol>');
				listType = 'ol';
			}
			html.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);
			continue;
		}

		closeList();
		if (/^>\s?/.test(line)) {
			html.push(`<blockquote>${renderInlineMarkdown(line.replace(/^>\s?/, ''))}</blockquote>`);
		} else {
			html.push(`<p>${renderInlineMarkdown(line)}</p>`);
		}
	}

	if (inFence) html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
	closeList();
	return html.join('');
}

function renderPalette(activeColor: string, action: string): string {
	return `
		<div class="inline-palette">
			${COLOR_PALETTE.map(color => `
				<button
					class="color-swatch ${color.value === activeColor ? 'is-active' : ''}"
					type="button"
					data-action="${action}"
					data-color="${color.value}"
					title="${escapeHtml(color.label)}"
					aria-label="${escapeHtml(color.label)}"
					style="--swatch-color: ${color.value};"
				></button>
			`).join('')}
		</div>
	`;
}

function renderMemoCard(memo: Memo): string {
	const detail = excerpt(memo.body);
	const isSelected = selectedMemoId === memo.id;
	const isTitleOnly = !memo.body.trim();

	return `
		<div
			class="memo-card ${isSelected ? 'is-selected' : ''} ${isTitleOnly ? 'is-title-only' : ''}"
			draggable="true"
			data-memo-id="${escapeHtml(memo.id)}"
			style="--memo-color: ${memo.color};"
		>
			<button class="memo-select" type="button" data-action="select-memo" data-memo-id="${escapeHtml(memo.id)}">
				<span class="memo-title">${escapeHtml(memo.title)}</span>
				${detail ? `<span class="memo-excerpt">${escapeHtml(detail)}</span>` : ''}
			</button>
		</div>
	`;
}

function renderMemoTooltip(): string {
	if (!tooltipMemoId || tooltipMemoId === selectedMemoId || isMobileView()) return '';
	const memo = memoById(tooltipMemoId);
	if (!memo) return '';
	const verticalStyle = tooltipPlacement === 'above'
		? `top: auto; bottom: ${tooltipBottom}px;`
		: `top: ${tooltipTop}px; bottom: auto;`;

	return `
		<div class="memo-tip" data-tooltip-memo-id="${escapeHtml(memo.id)}" style="left: ${tooltipLeft}px; ${verticalStyle} max-height: ${tooltipMaxHeight}px;">
			<div class="memo-tip-title">${escapeHtml(memo.title)}</div>
			${memo.body.trim() ? `<div class="rendered-markdown">${renderMarkdown(memo.body)}</div>` : ''}
		</div>
	`;
}

function renderMemoForm(isCompact: boolean, memo: Memo | null): string {
	const isEditing = !!memo;
	const title = memo?.title || '';
	const body = memo?.body || '';
	const activeColor = isEditing ? editMemoColor : addMemoColor;

	return `
		<div class="add-memo-panel">
			<form class="add-memo-form" data-action="submit-memo" data-memo-id="${memo ? escapeHtml(memo.id) : ''}">
				${isCompact ? `
					<textarea class="memo-input" name="memoText" rows="3" placeholder="Memo">${escapeHtml(title)}</textarea>
				` : `
					<input class="memo-input" name="title" type="text" placeholder="Title" value="${escapeHtml(title)}">
					<textarea class="memo-input" name="body" rows="6" placeholder="Content">${escapeHtml(body)}</textarea>
				`}
				<div class="form-row">
					${renderPalette(activeColor, isEditing ? 'set-edit-color' : 'set-add-color')}
					<div class="form-actions">
						<button class="secondary-button" type="button" data-action="cancel-memo-form">Cancel</button>
						<button class="primary-button" type="submit">${isEditing ? 'Save' : 'Add'}</button>
					</div>
				</div>
			</form>
		</div>
	`;
}

function renderCompactDocument(): string {
	if (!memoDocument) return '';
	return `
		<div class="memo-layout is-compact">
			<header class="memo-header">
				<div class="note-title">${escapeHtml(memoDocument.title)}</div>
				<div class="memo-actions">
					<button class="add-memo-button" type="button" data-action="show-add-memo" title="Add memo">+</button>
					<div class="memo-count">${memoDocument.memos.length} memos</div>
				</div>
			</header>
			<main class="memo-main">
				<section class="memo-grid" aria-label="Memos">
					${isAddingMemo ? renderMemoForm(true, null) : ''}
					${editingMemoId ? renderMemoForm(true, memoById(editingMemoId)) : ''}
					${memoDocument.memos.map(renderMemoCard).join('')}
				</section>
			</main>
			${statusText ? `<div class="status">${escapeHtml(statusText)}</div>` : ''}
			${renderMemoTooltip()}
		</div>
	`;
}

function renderFullDocument(): string {
	if (!memoDocument) return '';
	const memo = selectedMemo();
	return `
		<div class="memo-layout">
			<header class="memo-header">
				<div class="note-title">${escapeHtml(memoDocument.title)}</div>
				<div class="memo-actions">
					<button class="add-memo-button" type="button" data-action="show-add-memo" title="Add memo">+</button>
					<div class="memo-count">${memoDocument.memos.length} memos</div>
				</div>
			</header>
			<main class="memo-main">
				<section class="memo-grid" aria-label="Memos">
					${isAddingMemo ? renderMemoForm(false, null) : ''}
					${editingMemoId ? renderMemoForm(false, memoById(editingMemoId)) : ''}
					${memoDocument.memos.map(renderMemoCard).join('')}
				</section>
				<aside class="memo-detail">
					${memo ? renderMemoDetail(memo) : ''}
				</aside>
			</main>
			${statusText ? `<div class="status">${escapeHtml(statusText)}</div>` : ''}
			${renderMemoTooltip()}
		</div>
	`;
}

function renderMemoDetail(memo: Memo): string {
	return `
		<div class="detail-toolbar">
			<div class="detail-title">${escapeHtml(memo.title)}</div>
		</div>
		<div class="detail-body rendered-markdown">${memo.body.trim() ? renderMarkdown(memo.body) : '<p class="muted">No additional content.</p>'}</div>
	`;
}

function clearTooltip(render = true): void {
	window.clearTimeout(tooltipTimer);
	if (!tooltipMemoId) return;
	tooltipMemoId = '';
	if (render) {
		renderDocument();
	} else {
		root?.querySelector('.memo-tip')?.remove();
	}
}

function updateSelectedMemoView(memoId: string): void {
	const memo = memoById(memoId);
	if (!memo) return;

	selectedMemoId = memoId;
	clearTooltip(false);

	root?.querySelectorAll<HTMLElement>('.memo-card').forEach(card => {
		card.classList.toggle('is-selected', card.dataset.memoId === memoId);
	});

	const detail = root?.querySelector<HTMLElement>('.memo-detail');
	if (detail) {
		detail.innerHTML = renderMemoDetail(memo);
		detail.scrollTop = 0;
	}
}

function renderDocument(): void {
	if (!root) return;
	const gridScroll = root.querySelector<HTMLElement>('.memo-grid')?.scrollTop || 0;
	const detailScroll = root.querySelector<HTMLElement>('.memo-detail')?.scrollTop || 0;

	if (!memoDocument) {
		root.innerHTML = `
			<div class="empty-state">
				<div class="empty-title">JoplinMemo</div>
				<div class="empty-copy">${escapeHtml(errorText || emptyText || 'Open a note to view memos.')}</div>
			</div>
		`;
		return;
	}

	root.innerHTML = isCompactDocument(memoDocument) ? renderCompactDocument() : renderFullDocument();

	const grid = root.querySelector<HTMLElement>('.memo-grid');
	const detail = root.querySelector<HTMLElement>('.memo-detail');
	if (grid) grid.scrollTop = gridScroll;
	if (detail) detail.scrollTop = detailScroll;
}

function unwrapPluginMessage(eventOrMessage: PluginMessageEvent | PluginMessage): PluginMessage {
	if ('type' in eventOrMessage) return eventOrMessage;
	return eventOrMessage.message;
}

function applyPluginMessage(eventOrMessage: PluginMessageEvent | PluginMessage): void {
	const message = unwrapPluginMessage(eventOrMessage);

	if (message.type === 'document') {
		memoDocument = message.document;
		resourcePaths = message.resourcePaths || {};
		const selectedStillExists = memoDocument.memos.some(memo => memo.id === selectedMemoId);
		selectedMemoId = selectedStillExists ? selectedMemoId : memoDocument.memos[0]?.id || '';
		isAddingMemo = false;
		editingMemoId = '';
		tooltipMemoId = '';
		emptyText = '';
		errorText = '';
		statusText = '';
		renderDocument();
	}

	if (message.type === 'empty') {
		memoDocument = null;
		resourcePaths = {};
		selectedMemoId = '';
		emptyText = message.message;
		errorText = '';
		renderDocument();
	}

	if (message.type === 'error') {
		memoDocument = null;
		resourcePaths = {};
		selectedMemoId = '';
		errorText = message.message;
		renderDocument();
	}
}

async function handleClick(event: MouseEvent): Promise<void> {
	const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
	if (!target) return;

	if (target.dataset.action === 'select-memo' && target.dataset.memoId) {
		const memoId = target.dataset.memoId;
		if (selectedMemoId === memoId) {
			clearTooltip(false);
			return;
		}
		updateSelectedMemoView(memoId);
	}

	if (target.dataset.action === 'show-add-memo' && memoDocument) {
		isAddingMemo = true;
		editingMemoId = '';
		tooltipMemoId = '';
		renderDocument();
		setTimeout(() => root?.querySelector<HTMLElement>('.memo-input')?.focus(), 0);
	}

	if (target.dataset.action === 'cancel-memo-form') {
		cancelMemoForm();
	}

	if (target.dataset.action === 'set-add-color' && target.dataset.color) {
		addMemoColor = target.dataset.color;
		renderDocument();
	}

	if (target.dataset.action === 'set-edit-color' && target.dataset.color) {
		editMemoColor = target.dataset.color;
		renderDocument();
	}
}

function handlePointerDown(event: PointerEvent): void {
	const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action="select-memo"]');
	if (!target?.dataset.memoId) return;

	if (selectedMemoId === target.dataset.memoId) {
		clearTooltip(false);
		return;
	}

	updateSelectedMemoView(target.dataset.memoId);
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
	const form = (event.target as HTMLElement).closest<HTMLFormElement>('[data-action="submit-memo"]');
	if (!form || !memoDocument) return;
	event.preventDefault();

	const formData = new FormData(form);
	const isCompact = isCompactDocument(memoDocument);
	const memoId = form.dataset.memoId || '';
	const title = isCompact
		? String(formData.get('memoText') || '').trim()
		: String(formData.get('title') || '').trim();
	const body = isCompact ? '' : String(formData.get('body') || '').trim();
	const bodyLines = body.split('\n');
	const fallbackTitle = bodyLines.shift()?.trim() || 'New memo';
	const normalizedTitle = title || fallbackTitle;
	const normalizedBody = title ? body : bodyLines.join('\n').trim();

	if (!title && !body) {
		statusText = 'Enter memo content first.';
		renderDocument();
		return;
	}

	statusText = 'Saving...';
	renderDocument();
	const response = await webviewApi.postMessage({
		type: memoId ? 'editMemo' : 'addMemo',
		noteId: memoDocument.noteId,
		...(memoId ? { memoId } : {}),
		title: normalizedTitle,
		body: normalizedBody,
		color: memoId ? editMemoColor : addMemoColor,
	}) as PluginMessage | { ok?: boolean };
	addMemoColor = DEFAULT_MEMO_COLOR;
	editMemoColor = DEFAULT_MEMO_COLOR;
	if ('type' in response) applyPluginMessage(response);
}

function handleDoubleClick(event: MouseEvent): void {
	const card = (event.target as HTMLElement).closest<HTMLElement>('.memo-card');
	if (!card?.dataset.memoId) return;
	const memo = memoById(card.dataset.memoId);
	if (!memo) return;

	selectedMemoId = memo.id;
	isAddingMemo = false;
	editingMemoId = memo.id;
	editMemoColor = memo.color || DEFAULT_MEMO_COLOR;
	tooltipMemoId = '';
	renderDocument();
	setTimeout(() => root?.querySelector<HTMLElement>('.memo-input')?.focus(), 0);
}

function setupMemoTooltip(): void {
	if (!root) return;

	root.addEventListener('mouseover', event => {
		if (isMobileView()) return;
		if ((event.target as HTMLElement).closest('.memo-tip')) return;
		const card = (event.target as HTMLElement).closest<HTMLElement>('.memo-card');
		if (!card?.dataset.memoId) return;
		const relatedTarget = event.relatedTarget as HTMLElement | null;
		if (relatedTarget && card.contains(relatedTarget)) return;
		const memoId = card.dataset.memoId;
		if (memoId === selectedMemoId) {
			clearTooltip();
			return;
		}
		const rect = card.getBoundingClientRect();
		window.clearTimeout(tooltipTimer);
		tooltipTimer = window.setTimeout(() => {
			if (editingMemoId || isAddingMemo) return;
			if (selectedMemoId === memoId || isMobileView()) return;
			const width = Math.min(360, Math.max(260, window.innerWidth - 32));
			const belowSpace = window.innerHeight - rect.bottom - 12;
			const aboveSpace = rect.top - 12;
			tooltipLeft = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
			if (belowSpace >= 160 || belowSpace >= aboveSpace) {
				tooltipPlacement = 'below';
				tooltipTop = rect.bottom;
				tooltipBottom = 0;
				tooltipMaxHeight = Math.max(96, Math.min(320, belowSpace));
			} else {
				tooltipPlacement = 'above';
				tooltipTop = 0;
				tooltipBottom = window.innerHeight - rect.top;
				tooltipMaxHeight = Math.max(96, Math.min(320, aboveSpace));
			}
			tooltipMemoId = memoId;
			renderDocument();
		}, TOOLTIP_DELAY_MS);
	});

	root.addEventListener('mouseout', event => {
		const fromCard = (event.target as HTMLElement).closest<HTMLElement>('.memo-card');
		const relatedTarget = event.relatedTarget as HTMLElement | null;
		const toCard = relatedTarget ? relatedTarget.closest<HTMLElement>('.memo-card') : null;
		if (fromCard && fromCard === toCard) return;
		clearTooltip();
	});
}

function cancelMemoForm(): void {
	if (!isAddingMemo && !editingMemoId) return;
	isAddingMemo = false;
	editingMemoId = '';
	addMemoColor = DEFAULT_MEMO_COLOR;
	editMemoColor = DEFAULT_MEMO_COLOR;
	statusText = '';
	renderDocument();
}

function handleKeyDown(event: KeyboardEvent): void {
	if (event.key !== 'Escape') return;
	if (!isAddingMemo && !editingMemoId) return;
	event.preventDefault();
	cancelMemoForm();
}

function moveMemo(targetMemoId: string, insertAfter: boolean): void {
	if (!memoDocument || !draggedMemoId || draggedMemoId === targetMemoId) return;

	const fromIndex = memoDocument.memos.findIndex(memo => memo.id === draggedMemoId);
	const toIndex = memoDocument.memos.findIndex(memo => memo.id === targetMemoId);
	if (fromIndex < 0 || toIndex < 0) return;

	const [memo] = memoDocument.memos.splice(fromIndex, 1);
	const rawToIndex = insertAfter ? toIndex + 1 : toIndex;
	const adjustedToIndex = fromIndex < rawToIndex ? rawToIndex - 1 : rawToIndex;
	memoDocument.memos.splice(adjustedToIndex, 0, memo);
	selectedMemoId = memo.id;
	statusText = 'Saving...';
	renderDocument();

	webviewApi.postMessage({
		type: 'reorderMemos',
		noteId: memoDocument.noteId,
		memoIds: memoDocument.memos.map(item => item.id),
	}).then(response => {
		if (response && typeof response === 'object' && 'type' in response) {
			applyPluginMessage(response as PluginMessage);
		} else {
			statusText = '';
			renderDocument();
		}
	}).catch(error => {
		statusText = error instanceof Error ? error.message : 'Save failed';
		renderDocument();
	});
}

function setupDragAndDrop(): void {
	if (!root) return;

	root.addEventListener('dragstart', event => {
		const card = (event.target as HTMLElement).closest<HTMLElement>('.memo-card');
		if (!card?.dataset.memoId) return;
		draggedMemoId = card.dataset.memoId;
		card.classList.add('is-dragging');
		event.dataTransfer?.setData('text/plain', draggedMemoId);
	});

	root.addEventListener('dragend', event => {
		const card = (event.target as HTMLElement).closest<HTMLElement>('.memo-card');
		card?.classList.remove('is-dragging');
		draggedMemoId = '';
	});

	root.addEventListener('dragover', event => {
		if ((event.target as HTMLElement).closest('.memo-card')) {
			event.preventDefault();
		}
	});

	root.addEventListener('drop', event => {
		const card = (event.target as HTMLElement).closest<HTMLElement>('.memo-card');
		if (!card?.dataset.memoId) return;
		event.preventDefault();
		const rect = card.getBoundingClientRect();
		const insertAfter = event.clientY > rect.top + rect.height / 2 || event.clientX > rect.left + rect.width / 2;
		moveMemo(card.dataset.memoId, insertAfter);
	});
}

async function start(): Promise<void> {
	if (!root) return;

	webviewApi.onMessage(applyPluginMessage);
	root.addEventListener('pointerdown', handlePointerDown, true);
	root.addEventListener('click', handleClick);
	root.addEventListener('submit', handleSubmit);
	root.addEventListener('dblclick', handleDoubleClick);
	root.addEventListener('keydown', handleKeyDown);
	setupDragAndDrop();
	setupMemoTooltip();

	const initial = await webviewApi.postMessage({ type: 'ready' }) as PluginMessage | { ok?: boolean };
	if ('type' in initial) {
		applyPluginMessage(initial);
	} else {
		renderDocument();
	}
}

start();
