import { DEFAULT_MEMO_COLOR } from './types';
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

export function readTitle(raw: string): { title: string; color: string } {
 const match = /\s*\\?\[\\?\[\s*(#[0-9a-fA-F]{6}|[A-Za-z]+)\s*\\?\]\\?\]\s*$/.exec(raw);
 if (!match) return { title: raw, color: DEFAULT_MEMO_COLOR };
 const key = match[1].toLowerCase();
 const color = /^#[0-9a-f]{6}$/.test(key) ? key : Object.prototype.hasOwnProperty.call(NAMED_COLORS, key) ? NAMED_COLORS[key] : undefined;
 return color ? { title: raw.slice(0, match.index), color } : { title: raw, color: DEFAULT_MEMO_COLOR };
}
