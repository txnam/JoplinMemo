import { DEFAULT_MEMO_COLOR, Memo, MemoDocument } from './types';

function colorMarker(memo: Memo): string {
	return memo.color && memo.color !== DEFAULT_MEMO_COLOR ? ` [[${memo.color}]]` : '';
}

function cleanTitle(title: string): string {
	return title.replace(/\s+/g, ' ').trim() || 'Untitled memo';
}

function indentBody(body: string, width: number): string {
	if (!body.trim()) return '';
	const prefix = ' '.repeat(width);
	return body.split('\n').map(line => line ? `${prefix}${line}` : '').join('\n');
}

export function serializeMemoDocument(document: MemoDocument): string {
	const rule = document.rule;

	if (rule.type === 'heading') {
		const prefix = '#'.repeat(rule.level);
		return document.memos.map(memo => {
			const title = `${prefix} ${cleanTitle(memo.title)}${colorMarker(memo)}`;
			return memo.body.trim() ? `${title}\n${memo.body.trim()}` : title;
		}).join('\n\n');
	}

	if (rule.type === 'unordered-list') {
		const indent = ' '.repeat(rule.indent);
		return document.memos.map(memo => {
			const title = `${indent}- ${cleanTitle(memo.title)}${colorMarker(memo)}`;
			const body = indentBody(memo.body, rule.bodyIndent);
			return body ? `${title}\n${body}` : title;
		}).join('\n');
	}

	if (rule.type === 'ordered-list') {
		const indent = ' '.repeat(rule.indent);
		return document.memos.map((memo, index) => {
			const marker = `${index + 1}. `;
			const title = `${indent}${marker}${cleanTitle(memo.title)}${colorMarker(memo)}`;
			const body = indentBody(memo.body, Math.max(rule.bodyIndent, rule.indent + marker.length));
			return body ? `${title}\n${body}` : title;
		}).join('\n');
	}

	if (rule.type === 'reverse-number-slash') {
		const indent = ' '.repeat(rule.indent);
		return document.memos.map((memo, index) => {
			const marker = `${document.memos.length - index}/ `;
			const title = `${indent}${marker}${cleanTitle(memo.title)}${colorMarker(memo)}`;
			const body = indentBody(memo.body, Math.max(rule.bodyIndent, rule.indent + marker.length));
			return body ? `${title}\n${body}` : title;
		}).join('\n\n');
	}

	return document.memos.map(memo => {
		const title = `${cleanTitle(memo.title)}${colorMarker(memo)}`;
		return memo.body.trim() ? `${title}\n${memo.body.trim()}` : title;
	}).join('\n\n');
}
