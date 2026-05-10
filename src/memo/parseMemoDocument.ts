import { DEFAULT_MEMO_COLOR, Memo, MemoDocument, MemoSplitRule } from './types';

type ParsedTitle = {
	title: string;
	color: string;
};

type StructuralMarker = {
	rule: MemoSplitRule;
	title: string;
};

const NAMED_COLORS: Record<string, string> = {
	amber: '#f59e0b',
	blue: '#3abef9',
	charcoal: '#334155',
	coral: '#ff6b6b',
	emerald: '#10b981',
	fuchsia: '#d946ef',
	gold: '#f9b572',
	gray: '#64748b',
	green: '#16a34a',
	grey: '#64748b',
	indigo: '#6366f1',
	lavender: '#a78bfa',
	leaf: '#16a34a',
	lemon: '#fde047',
	lime: '#84cc16',
	mint: '#95e1d3',
	navy: '#1e3a8a',
	ocean: '#00adb5',
	orange: '#fb923c',
	pink: '#f875aa',
	purple: '#8b5cf6',
	red: '#dc2626',
	rose: '#ff4d6d',
	royal: '#2563eb',
	royalblue: '#2563eb',
	slate: '#64748b',
	sky: '#7dd3fc',
	stone: '#d6d3d1',
	teal: '#14b8a6',
	white: '#ffffff',
	yellow: '#facc15',
};

function splitLines(markdown: string): string[] {
	return markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function trimBlankLines(lines: string[]): string {
	let start = 0;
	let end = lines.length;

	while (start < end && lines[start].trim() === '') start += 1;
	while (end > start && lines[end - 1].trim() === '') end -= 1;

	return lines.slice(start, end).join('\n');
}

function isFenceLine(line: string): boolean {
	return /^(```|~~~)/.test(line.trim());
}

function horizontalRuleMarker(line: string): string | null {
	const trimmed = line.trim();
	if (/^(?:\*\s*){3,}$/.test(trimmed)) return trimmed;
	if (/^(?:-\s*){3,}$/.test(trimmed)) return trimmed;
	if (/^(?:_\s*){3,}$/.test(trimmed)) return trimmed;
	return null;
}

function normalizeColor(value: string | undefined): string {
	if (!value) return DEFAULT_MEMO_COLOR;
	const normalized = value.trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
	return NAMED_COLORS[normalized] || DEFAULT_MEMO_COLOR;
}

function parseTitle(rawTitle: string): ParsedTitle {
	const markerMatch = /\s*\\?\[\\?\[\s*(#[0-9a-fA-F]{6}|[A-Za-z]+)\s*\\?\]\\?\]\s*$/.exec(rawTitle);
	if (!markerMatch) {
		return {
			title: rawTitle.replace(/\s+/g, ' ').trim() || 'Untitled memo',
			color: DEFAULT_MEMO_COLOR,
		};
	}

	return {
		title: rawTitle.slice(0, markerMatch.index).replace(/\s+/g, ' ').trim() || 'Untitled memo',
		color: normalizeColor(markerMatch[1]),
	};
}

function stripMarkdownLead(line: string): string {
	return line
		.replace(/^#{1,6}\s+/, '')
		.replace(/^[-*+]\s+/, '')
		.replace(/^\d+[.)]\s+/, '')
		.replace(/^\d+\/\s*/, '')
		.replace(/^>\s?/, '')
		.trim();
}

function memoId(prefix: string, index: number): string {
	return `${prefix}-${index + 1}`;
}

function createMemo(rawTitle: string, bodyLines: string[], source: Memo['source'], index: number): Memo {
	const parsedTitle = parseTitle(stripMarkdownLead(rawTitle));
	return {
		id: memoId(source, index),
		title: parsedTitle.title,
		body: trimBlankLines(bodyLines),
		color: parsedTitle.color,
		source,
	};
}

function createMemoFromBlock(blockLines: string[], source: Memo['source'], index: number): Memo | null {
	const trimmedBlock = trimBlankLines(blockLines);
	if (!trimmedBlock) return null;

	const [firstLine, ...bodyLines] = trimmedBlock.split('\n');
	return createMemo(firstLine, bodyLines, source, index);
}

function structuralMarker(line: string): StructuralMarker | null {
	const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
	if (headingMatch) {
		return {
			rule: { type: 'heading', level: headingMatch[1].length },
			title: headingMatch[2],
		};
	}

	const unorderedMatch = /^(\s*)[-*+]\s+(.+?)\s*$/.exec(line);
	if (unorderedMatch) {
		const prefixMatch = /^(\s*)[-*+]\s+/.exec(line);
		return {
			rule: {
				type: 'unordered-list',
				indent: unorderedMatch[1].length,
				bodyIndent: prefixMatch ? prefixMatch[0].length : unorderedMatch[1].length + 2,
			},
			title: unorderedMatch[2],
		};
	}

	const orderedMatch = /^(\s*)\d+[.)]\s+(.+?)\s*$/.exec(line);
	if (orderedMatch) {
		const prefixMatch = /^(\s*)\d+[.)]\s+/.exec(line);
		return {
			rule: {
				type: 'ordered-list',
				indent: orderedMatch[1].length,
				bodyIndent: prefixMatch ? prefixMatch[0].length : orderedMatch[1].length + 3,
			},
			title: orderedMatch[2],
		};
	}

	return null;
}

function sameRule(left: MemoSplitRule, right: MemoSplitRule): boolean {
	if (left.type !== right.type) return false;
	if (left.type === 'heading' && right.type === 'heading') return left.level === right.level;
	if (
		left.type !== 'heading' &&
		left.type !== 'abstract-heading' &&
		left.type !== 'separator-section' &&
		left.type !== 'block' &&
		right.type !== 'heading' &&
		right.type !== 'abstract-heading' &&
		right.type !== 'separator-section' &&
		right.type !== 'block'
	) {
		return left.indent === right.indent;
	}
	return false;
}

function findFirstSplitRule(lines: string[]): MemoSplitRule | null {
	let inFence = false;

	for (const line of lines) {
		if (isFenceLine(line)) {
			inFence = !inFence;
			continue;
		}

		if (inFence || line.trim() === '') continue;
		return structuralMarker(line)?.rule || null;
	}

	return null;
}

function unindentListBody(line: string, rule: MemoSplitRule): string {
	if (rule.type === 'heading' || rule.type === 'abstract-heading' || rule.type === 'separator-section' || rule.type === 'block') return line;
	const pattern = new RegExp(`^ {0,${rule.bodyIndent}}`);
	return line.replace(pattern, '');
}

function parseSeparatorSections(lines: string[]): { rule: MemoSplitRule; memos: Memo[] } | null {
	let inFence = false;
	let marker = '';
	let headingLevel = 0;
	const sections: string[][] = [];
	let current: string[] = [];

	const finish = () => {
		if (trimBlankLines(current)) sections.push(current);
		current = [];
	};

	for (const line of lines) {
		if (isFenceLine(line)) {
			current.push(line);
			inFence = !inFence;
			continue;
		}

		const horizontalRule = !inFence ? horizontalRuleMarker(line) : null;
		if (horizontalRule) {
			marker = marker || horizontalRule;
			finish();
			continue;
		}

		current.push(line);
	}

	finish();
	if (!marker || sections.length < 2) return null;

	const memos = sections
		.map((section, index) => {
			const firstLine = trimBlankLines(section).split('\n')[0] || '';
			const structural = structuralMarker(firstLine);
			if (structural?.rule.type === 'heading') {
				headingLevel = headingLevel || structural.rule.level;
				const memo = createMemoFromBlock(section, 'heading', index);
				return memo ? { ...memo, headingLevel: structural.rule.level } : null;
			}

			return createMemoFromBlock(section, 'separator-section', index);
		})
		.filter((memo): memo is Memo => !!memo);
	return memos.length >= 2 ? { rule: { type: 'separator-section', marker, ...(headingLevel ? { headingLevel } : {}) }, memos } : null;
}

function parseAbstractHeadingMemos(lines: string[]): { rule: MemoSplitRule; memos: Memo[] } | null {
	let inFence = false;
	let firstHeadingIndex = -1;
	let firstHeadingRule: MemoSplitRule | null = null;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (isFenceLine(line)) {
			inFence = !inFence;
			continue;
		}

		const marker = !inFence ? structuralMarker(line) : null;
		if (marker?.rule.type === 'heading') {
			firstHeadingIndex = index;
			firstHeadingRule = marker.rule;
			break;
		}
	}

	if (firstHeadingIndex <= 0 || !firstHeadingRule || firstHeadingRule.type !== 'heading') return null;

	const abstractMemo = createMemoFromBlock(lines.slice(0, firstHeadingIndex), 'abstract', 0);
	if (!abstractMemo) return null;

	const headingMemos = parseStructuralMemos(lines.slice(firstHeadingIndex));
	if (!headingMemos || headingMemos.rule.type !== 'heading' || headingMemos.rule.level !== firstHeadingRule.level) return null;

	return {
		rule: { type: 'abstract-heading', level: firstHeadingRule.level },
		memos: [abstractMemo, ...headingMemos.memos.map((memo, index) => ({
			...memo,
			id: memoId('heading', index),
		}))],
	};
}

function reverseNumberSlashMarker(line: string): { title: string; indent: number; bodyIndent: number } | null {
	const markerMatch = /^(\s*)\d+\/\s*(.+?)\s*$/.exec(line);
	if (!markerMatch) return null;
	const prefixMatch = /^(\s*)\d+\/\s*/.exec(line);
	return {
		title: markerMatch[2],
		indent: markerMatch[1].length,
		bodyIndent: prefixMatch ? prefixMatch[0].length : markerMatch[1].length + 2,
	};
}

function parseReverseNumberSlashMemos(lines: string[]): { rule: MemoSplitRule; memos: Memo[] } | null {
	let inFence = false;
	let rule: MemoSplitRule | null = null;
	const memos: Memo[] = [];
	let currentTitle = '';
	let currentBody: string[] = [];

	const finish = () => {
		if (!currentTitle || !rule) return;
		memos.push(createMemo(currentTitle, currentBody.map(line => unindentListBody(line, rule as MemoSplitRule)), 'reverse-number-list', memos.length));
		currentTitle = '';
		currentBody = [];
	};

	for (const line of lines) {
		if (isFenceLine(line)) {
			if (currentTitle) currentBody.push(line);
			inFence = !inFence;
			continue;
		}

		const marker = !inFence ? reverseNumberSlashMarker(line) : null;
		if (marker && (!rule || (rule.type === 'reverse-number-slash' && marker.indent === rule.indent))) {
			finish();
			rule = {
				type: 'reverse-number-slash',
				indent: marker.indent,
				bodyIndent: marker.bodyIndent,
			};
			currentTitle = marker.title;
			continue;
		}

		if (currentTitle) currentBody.push(line);
	}

	finish();
	return rule && memos.length >= 2 ? { rule, memos } : null;
}

function parseStructuralMemos(lines: string[]): { rule: MemoSplitRule; memos: Memo[] } | null {
	const rule = findFirstSplitRule(lines);
	if (!rule) return null;

	const memos: Memo[] = [];
	let inFence = false;
	let currentTitle = '';
	let currentBody: string[] = [];

	const finish = () => {
		if (!currentTitle) return;
		memos.push(createMemo(currentTitle, currentBody, rule.type === 'heading' ? 'heading' : 'list', memos.length));
		currentTitle = '';
		currentBody = [];
	};

	for (const line of lines) {
		if (isFenceLine(line)) {
			if (currentTitle) currentBody.push(unindentListBody(line, rule));
			inFence = !inFence;
			continue;
		}

		const marker = !inFence ? structuralMarker(line) : null;
		if (marker && sameRule(rule, marker.rule)) {
			finish();
			currentTitle = marker.title;
			continue;
		}

		if (currentTitle) currentBody.push(unindentListBody(line, rule));
	}

	finish();
	return memos.length >= 2 ? { rule, memos } : null;
}

function parseBlockMemos(lines: string[]): Memo[] {
	const blocks: string[][] = [];
	let current: string[] = [];
	let inFence = false;

	const finish = () => {
		const body = trimBlankLines(current);
		if (body) blocks.push(body.split('\n'));
		current = [];
	};

	for (const line of lines) {
		if (!inFence && line.trim() === '') {
			finish();
		} else {
			current.push(line);
		}

		if (isFenceLine(line)) inFence = !inFence;
	}

	finish();

	return blocks.map((block, index) => {
		const [firstLine, ...bodyLines] = block;
		return createMemo(firstLine, bodyLines, 'block', index);
	});
}

function fallbackMemo(markdown: string): Memo {
	const lines = splitLines(markdown);
	const firstContentLine = lines.find(line => line.trim()) || 'Untitled memo';
	const body = trimBlankLines(lines);
	const parsedTitle = parseTitle(stripMarkdownLead(firstContentLine));

	return {
		id: 'whole-note-1',
		title: parsedTitle.title,
		body,
		color: parsedTitle.color,
		source: 'whole-note',
	};
}

export function parseMemoDocument(noteId: string, noteTitle: string, markdown: string): MemoDocument {
	const lines = splitLines(markdown);
	const separatorMemos = parseSeparatorSections(lines);
	const abstractHeadingMemos = separatorMemos ? null : parseAbstractHeadingMemos(lines);
	const structuralMemos = separatorMemos || abstractHeadingMemos ? null : parseStructuralMemos(lines);
	const reverseNumberMemos = separatorMemos || abstractHeadingMemos || structuralMemos ? null : parseReverseNumberSlashMemos(lines);
	const memos = separatorMemos?.memos || abstractHeadingMemos?.memos || structuralMemos?.memos || reverseNumberMemos?.memos || parseBlockMemos(lines);

	return {
		noteId,
		title: noteTitle || 'Untitled note',
		rule: separatorMemos?.rule || abstractHeadingMemos?.rule || structuralMemos?.rule || reverseNumberMemos?.rule || { type: 'block' },
		memos: memos.length ? memos : [fallbackMemo(markdown)],
	};
}
