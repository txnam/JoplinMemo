export const DEFAULT_MEMO_COLOR = '#ffffff';

export type Memo = {
	id: string;
	title: string;
	body: string;
	color: string;
	source: 'abstract' | 'heading' | 'separator-section' | 'list' | 'reverse-number-list' | 'block' | 'whole-note' | 'image';
	headingLevel?: number;
	number?: number;
	/** Internal source information; never embedded in a note. */
	original?: MemoSource;
};

export type MemoSource = {
	raw: string;
	gap: string;
	title: string;
	body: string;
	color: string;
	titleStart: number;
	titleEnd: number;
	bodyStart: number;
	prefix: string;
	bodyIndent: string;
	whole: boolean;
};

export type MemoSplitRule =
	| { type: 'abstract-heading'; level: number }
	| { type: 'separator-section'; marker: string; headingLevel?: number }
	| { type: 'heading'; level: number }
	| { type: 'unordered-list'; indent: number; bodyIndent: number }
	| { type: 'ordered-list'; indent: number; bodyIndent: number; start?: number; delimiter?: string }
	| { type: 'reverse-number-slash'; indent: number; bodyIndent: number }
	| { type: 'block' };

export type MemoDocument = {
	noteId: string;
	title: string;
	rule: MemoSplitRule;
	memos: Memo[];
	original?: { markdown: string; ids: string[]; prefix: string; eol: string };
	references?: string;
};

export type Slide = { id: string; imageMarkdown: string; caption: string; alt: string };
export type RenderedMemo = { title: string; body: string; full: string; error?: string };
export type RenderedSlide = Slide & { imageHtml: string; captionHtml: string; error?: string };
export type DocumentMessage = {
	type: 'document'; document: MemoDocument; revision: number;
	rendered: Record<string, RenderedMemo>; slides: RenderedSlide[];
	resourcePaths: Record<string, string>; operationId?: string; selectedMemoId?: string;
};
export type PluginMessage = DocumentMessage | { type: 'empty' | 'error'; message: string };
export type Mutation = {
	type: 'addMemo' | 'editMemo' | 'reorderMemos'; noteId: string;
	revision: number; operationId: string; memoId?: string; memoIds?: string[];
	title?: string; body?: string; color?: string;
};
export type WebviewMessage = Mutation | { type: 'ready' | 'reload' | 'retryRender' } | { type: 'openLink'; href: string };
export type MutationResult = DocumentMessage | { type: 'mutationError'; operationId: string; code: 'conflict' | 'invalid' | 'save'; message: string };

export const COLOR_PALETTE = [
	{ label: 'White', value: '#ffffff' },
	{ label: 'Cloud', value: '#eeeeee' },
	{ label: 'Stone', value: '#d6d3d1' },
	{ label: 'Lemon', value: '#fde047' },
	{ label: 'Yellow', value: '#facc15' },
	{ label: 'Amber', value: '#f59e0b' },
	{ label: 'Gold', value: '#f9b572' },
	{ label: 'Orange', value: '#fb923c' },
	{ label: 'Coral', value: '#ff6b6b' },
	{ label: 'Red', value: '#dc2626' },
	{ label: 'Rose', value: '#ff4d6d' },
	{ label: 'Pink', value: '#f875aa' },
	{ label: 'Fuchsia', value: '#d946ef' },
	{ label: 'Lavender', value: '#a78bfa' },
	{ label: 'Purple', value: '#8b5cf6' },
	{ label: 'Indigo', value: '#6366f1' },
	{ label: 'Blue', value: '#3abef9' },
	{ label: 'Royal Blue', value: '#2563eb' },
	{ label: 'Navy', value: '#1e3a8a' },
	{ label: 'Sky', value: '#7dd3fc' },
	{ label: 'Ocean', value: '#00adb5' },
	{ label: 'Teal', value: '#14b8a6' },
	{ label: 'Mint', value: '#95e1d3' },
	{ label: 'Lime', value: '#84cc16' },
	{ label: 'Leaf', value: '#16a34a' },
	{ label: 'Emerald', value: '#10b981' },
	{ label: 'Slate', value: '#64748b' },
	{ label: 'Charcoal', value: '#334155' },
];
