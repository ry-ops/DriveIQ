// Aiana conversation memory — one shared conversation for the single owner,
// stored in D1 (aiana_messages) so it follows them across
// devices and survives a page reload.
//
// The conversation ends after IDLE_HOURS with no new message: the next
// read finds it stale and clears it. Only the last MAX_EXCHANGES
// question/answer pairs are sent to the model, to keep requests small.

import type { Env } from '../env.js';

export const IDLE_HOURS = 4;
export const MAX_EXCHANGES = 10;

// "Today" uses the time zone the owner's browser reports with each question,
// so dates match their calendar. UTC if it's missing or not a real zone.
export function validTimeZone(tz: unknown): string {
	if (typeof tz !== 'string' || !tz || tz.length > 64) return 'UTC';
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return tz;
	} catch {
		return 'UTC';
	}
}

export interface StoredSource {
	document: string;
	page: number | null;
	relevance: number;
	thumbnail_url?: string;
	fullsize_url?: string;
}

export interface ConversationMessage {
	role: 'user' | 'assistant';
	content: string;
	sources?: StoredSource[];
}

export interface Conversation {
	messages: ConversationMessage[];
	// When the conversation will reset if no new message arrives (ISO, UTC);
	// null when there's no conversation yet.
	expires_at: string | null;
}

const IDLE = `-${IDLE_HOURS} hours`;

// D1 stores datetime('now') as "YYYY-MM-DD HH:MM:SS" in UTC.
function sqliteToIso(value: string | null): string | null {
	return value ? `${value.replace(' ', 'T')}Z` : null;
}

/** The current conversation, oldest first. Clears it if it has gone idle. */
export async function loadConversation(env: Env): Promise<Conversation> {
	const state = await env.DB.prepare(
		`SELECT COUNT(*) AS n,
		        MAX(created_at) < datetime('now', ?) AS stale,
		        datetime(MAX(created_at), '+${IDLE_HOURS} hours') AS expires_at
		 FROM aiana_messages`
	)
		.bind(IDLE)
		.first<{ n: number; stale: number | null; expires_at: string | null }>();

	if (!state || state.n === 0) return { messages: [], expires_at: null };
	if (state.stale) {
		await clearConversation(env);
		return { messages: [], expires_at: null };
	}

	const { results } = await env.DB.prepare(
		'SELECT role, content, sources FROM aiana_messages ORDER BY id DESC LIMIT ?'
	)
		.bind(MAX_EXCHANGES * 2)
		.all<{ role: 'user' | 'assistant'; content: string; sources: string | null }>();

	const messages: ConversationMessage[] = results.reverse().map((r) => ({
		role: r.role,
		content: r.content,
		...(r.sources ? { sources: JSON.parse(r.sources) as StoredSource[] } : {}),
	}));
	// The model needs the history to start with a question.
	while (messages.length > 0 && messages[0].role !== 'user') messages.shift();

	return { messages, expires_at: sqliteToIso(state.expires_at) };
}

/** Saves one question and its answer together, so the history stays paired. */
export async function appendExchange(env: Env, question: string, answer: string, sources: StoredSource[]): Promise<void> {
	await env.DB.batch([
		env.DB.prepare("INSERT INTO aiana_messages (role, content) VALUES ('user', ?)").bind(question),
		env.DB.prepare("INSERT INTO aiana_messages (role, content, sources) VALUES ('assistant', ?, ?)").bind(
			answer,
			sources.length > 0 ? JSON.stringify(sources) : null
		),
	]);
}

export async function clearConversation(env: Env): Promise<void> {
	await env.DB.prepare('DELETE FROM aiana_messages').run();
}

/** e.g. "Today is Monday, 2026-11-09 (America/New_York)." */
export function todayLine(timeZone = 'UTC', now: Date = new Date()): string {
	const tz = validTimeZone(timeZone);
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		weekday: 'long',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return `Today is ${get('weekday')}, ${get('year')}-${get('month')}-${get('day')} (${tz}).`;
}
