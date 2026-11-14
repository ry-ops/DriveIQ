import { describe, expect, it } from 'vitest';
import type { Env } from '../env.js';
import { loadConversation, todayLine } from './conversation.js';

describe('todayLine', () => {
	it("uses the owner's time zone, not UTC", () => {
		// 03:00 UTC on Nov 10 is still the evening of Nov 9 in New York.
		expect(todayLine('America/New_York', new Date('2026-11-10T03:00:00Z'))).toBe('Today is Monday, 2026-11-09 (America/New_York).');
		expect(todayLine('America/New_York', new Date('2026-11-10T15:00:00Z'))).toBe('Today is Tuesday, 2026-11-10 (America/New_York).');
	});

	it('falls back to UTC for a missing or made-up zone', () => {
		expect(todayLine(undefined, new Date('2026-11-10T03:00:00Z'))).toBe('Today is Tuesday, 2026-11-10 (UTC).');
		expect(todayLine('Mars/Olympus_Mons', new Date('2026-11-10T03:00:00Z'))).toBe('Today is Tuesday, 2026-11-10 (UTC).');
	});
});

// Minimal D1 stand-in: answers the state query, then the history query.
function fakeDb(state: { n: number; stale: number | null; expires_at: string | null }, rowsNewestFirst: object[] = []) {
	const ran: string[] = [];
	const stmt = (sql: string) => ({
		bind: () => stmt(sql),
		first: async () => state,
		all: async () => ({ results: [...rowsNewestFirst] }),
		run: async () => {
			ran.push(sql);
			return {};
		},
	});
	return { env: { DB: { prepare: (sql: string) => stmt(sql) } } as unknown as Env, ran };
}

describe('loadConversation', () => {
	it('returns nothing when there is no conversation', async () => {
		const { env } = fakeDb({ n: 0, stale: null, expires_at: null });
		expect(await loadConversation(env)).toEqual({ messages: [], expires_at: null });
	});

	it('clears a conversation that has been idle past the limit', async () => {
		const { env, ran } = fakeDb({ n: 4, stale: 1, expires_at: '2026-11-09 10:00:00' });
		expect(await loadConversation(env)).toEqual({ messages: [], expires_at: null });
		expect(ran.some((sql) => sql.startsWith('DELETE FROM aiana_messages'))).toBe(true);
	});

	it('returns history oldest-first, starting with a question, plus the expiry', async () => {
		const { env } = fakeDb({ n: 3, stale: 0, expires_at: '2026-11-09 16:00:00' }, [
			{ role: 'assistant', content: 'a2', sources: '[{"document":"Manual","page":4,"relevance":0.8}]' },
			{ role: 'user', content: 'q2', sources: null },
			{ role: 'assistant', content: 'a1 (orphaned by the history cap)', sources: null },
		]);
		const conv = await loadConversation(env);
		expect(conv.expires_at).toBe('2026-11-09T16:00:00Z');
		expect(conv.messages).toEqual([
			{ role: 'user', content: 'q2' },
			{ role: 'assistant', content: 'a2', sources: [{ document: 'Manual', page: 4, relevance: 0.8 }] },
		]);
	});
});
