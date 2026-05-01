export const DEFAULT_MEMO_COLOR = '#ffffff';

export type Memo = {
	id: string;
	title: string;
	body: string;
	color: string;
	source: 'heading' | 'list' | 'reverse-number-list' | 'block' | 'whole-note';
};

export type MemoSplitRule =
	| { type: 'heading'; level: number }
	| { type: 'unordered-list'; indent: number; bodyIndent: number }
	| { type: 'ordered-list'; indent: number; bodyIndent: number }
	| { type: 'reverse-number-slash'; indent: number; bodyIndent: number }
	| { type: 'block' };

export type MemoDocument = {
	noteId: string;
	title: string;
	rule: MemoSplitRule;
	memos: Memo[];
};

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
