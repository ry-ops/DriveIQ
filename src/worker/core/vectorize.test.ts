import { describe, expect, it } from 'vitest';
import type { Env } from '../env.js';
import { vectorId, vectorizeDeleteDocument, vectorizeSearch, vectorizeStatus, vectorizeUpsert } from './vectorize.js';

function fakeEnv(opts: { matches?: VectorizeMatch[]; chunkCount?: number; describeError?: string } = {}) {
	const upserted: VectorizeVector[] = [];
	const deleted: string[] = [];
	const sql: { sql: string; args: unknown[] }[] = [];
	const stmt = (q: string) => {
		const s = {
			args: [] as unknown[],
			bind: (...args: unknown[]) => {
				s.args = args;
				sql.push({ sql: q, args });
				return s;
			},
			first: async () => (opts.chunkCount != null ? { chunk_count: opts.chunkCount } : null),
			run: async () => ({}),
		};
		return s;
	};
	const env = {
		EMBEDDING_MODEL: '@cf/baai/bge-base-en-v1.5',
		AI: { run: async () => ({ shape: [1, 3], data: [[0.1, 0.2, 0.3]] }) },
		VECTORIZE: {
			upsert: async (v: VectorizeVector[]) => {
				upserted.push(...v);
				return { mutationId: 'm' };
			},
			deleteByIds: async (ids: string[]) => {
				deleted.push(...ids);
				return { mutationId: 'm' };
			},
			query: async () => ({ matches: opts.matches ?? [], count: opts.matches?.length ?? 0 }),
			describe: async () => {
				if (opts.describeError) throw new Error(opts.describeError);
				return { vectorCount: 1174, dimensions: 768 };
			},
		},
		DB: { prepare: stmt, batch: async () => [] },
	} as unknown as Env;
	return { env, upserted, deleted, sql };
}

describe('vectorId', () => {
	it('is deterministic, short, and differs per document', async () => {
		const a = await vectorId("Owner's Manual", 12);
		expect(a).toBe(await vectorId("Owner's Manual", 12));
		expect(a).toMatch(/^[0-9a-f]{16}:12$/);
		expect(a.length).toBeLessThanOrEqual(64);
		expect(a).not.toBe(await vectorId('Warranty & Maintenance Guide', 12));
	});
});

describe('vectorizeUpsert', () => {
	it('stores text and page in metadata, leaving out a missing page', async () => {
		const { env, upserted } = fakeEnv();
		await vectorizeUpsert(env, [
			{ document_name: "Owner's Manual", chunk_index: 0, content: 'p465 text', page_number: 465, vector: [1, 2, 3] },
			{ document_name: 'CARFAX Vehicle History Report', chunk_index: 0, content: 'no page', vector: [1, 2, 3] },
		]);
		expect(upserted[0].metadata).toEqual({ document_name: "Owner's Manual", chunk_index: 0, content: 'p465 text', page_number: 465 });
		expect(upserted[1].metadata).not.toHaveProperty('page_number');
	});
});

describe('vectorizeSearch', () => {
	it('applies the score threshold and maps metadata to search hits', async () => {
		const { env } = fakeEnv({
			matches: [
				{ id: 'a', score: 0.8, metadata: { document_name: "Owner's Manual", chunk_index: 3, content: 'oil', page_number: 465 } },
				{ id: 'b', score: 0.2, metadata: { document_name: "Owner's Manual", chunk_index: 4, content: 'noise', page_number: 1 } },
			],
		});
		expect(await vectorizeSearch(env, 'oil', 8, 0.35)).toEqual([
			{ score: 0.8, document_name: "Owner's Manual", chunk_index: 3, content: 'oil', page_number: 465 },
		]);
	});
});

describe('vectorizeDeleteDocument', () => {
	it("deletes every chunk id from the document's recorded count", async () => {
		const { env, deleted } = fakeEnv({ chunkCount: 3 });
		expect(await vectorizeDeleteDocument(env, 'Maintenance Audit Report')).toBe(3);
		expect(deleted).toEqual(await Promise.all([0, 1, 2].map((i) => vectorId('Maintenance Audit Report', i))));
	});

	it('does nothing for an unknown document', async () => {
		const { env, deleted } = fakeEnv();
		expect(await vectorizeDeleteDocument(env, 'Nope')).toBe(0);
		expect(deleted).toEqual([]);
	});
});

describe('vectorizeStatus', () => {
	it('reports the vector count when the index answers', async () => {
		const { env } = fakeEnv();
		expect(await vectorizeStatus(env)).toEqual({ state: 'ready', points_count: 1174 });
	});

	it('is unavailable (not "no documents") when Vectorize cannot be reached', async () => {
		const { env } = fakeEnv({ describeError: 'network down' });
		expect(await vectorizeStatus(env)).toEqual({ state: 'unavailable', error: 'network down' });
	});
});
