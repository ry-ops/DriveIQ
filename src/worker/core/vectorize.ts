// DriveIQ Cloud — document search on Cloudflare Vectorize (index
// `driveiq-docs`, 768-dim cosine, Workers AI embeddings).
//
// Vectorize deletes by id only, so chunk ids are predictable:
// "<first 16 hex chars of sha256(document name)>:<chunk_index>", and the D1
// `documents` table (migration 0009) records each document's chunk count.
// Writes are applied asynchronously: new chunks become searchable a few
// seconds after an upsert returns.

import type { Env } from '../env.js';
import { embed, type DocumentChunk, type SearchHit, type SearchStatus } from './embeddings.js';

const UPSERT_BATCH = 500;
const DELETE_BATCH = 500;

async function documentKey(name: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name));
	return [...new Uint8Array(digest)]
		.slice(0, 8)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function vectorId(documentName: string, chunkIndex: number): Promise<string> {
	return `${await documentKey(documentName)}:${chunkIndex}`;
}

export async function vectorizeStatus(env: Env): Promise<SearchStatus> {
	try {
		const info = await env.VECTORIZE.describe();
		return { state: 'ready', points_count: info.vectorCount };
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		console.error('Vectorize unavailable:', error);
		return { state: 'unavailable', error: error.slice(0, 300) };
	}
}

/** Upserts chunks with their vectors and updates each document's chunk count. */
export async function vectorizeUpsert(env: Env, chunks: Array<DocumentChunk & { vector: number[] }>): Promise<void> {
	if (chunks.length === 0) return;
	const vectors: VectorizeVector[] = await Promise.all(
		chunks.map(async (c) => ({
			id: await vectorId(c.document_name, c.chunk_index),
			values: c.vector,
			metadata: {
				document_name: c.document_name,
				chunk_index: c.chunk_index,
				content: c.content,
				...(c.page_number != null ? { page_number: c.page_number } : {}),
			},
		}))
	);
	for (let i = 0; i < vectors.length; i += UPSERT_BATCH) {
		await env.VECTORIZE.upsert(vectors.slice(i, i + UPSERT_BATCH));
	}

	const counts = new Map<string, number>();
	for (const c of chunks) counts.set(c.document_name, Math.max(counts.get(c.document_name) ?? 0, c.chunk_index + 1));
	await env.DB.batch(
		[...counts].map(([name, count]) =>
			env.DB.prepare(
				`INSERT INTO documents (name, chunk_count) VALUES (?, ?)
				 ON CONFLICT(name) DO UPDATE SET chunk_count = MAX(chunk_count, excluded.chunk_count), updated_at = datetime('now')`
			).bind(name, count)
		)
	);
}

export async function vectorizeSearch(env: Env, query: string, limit = 5, scoreThreshold = 0.3): Promise<SearchHit[]> {
	const vector = await embed(env, query);
	const result = await env.VECTORIZE.query(vector, { topK: Math.min(limit, 50), returnMetadata: 'all' });
	return result.matches
		.filter((m) => m.score >= scoreThreshold && m.metadata)
		.map((m) => {
			const md = m.metadata as Record<string, VectorizeVectorMetadataValue>;
			return {
				score: m.score,
				document_name: String(md.document_name),
				chunk_index: Number(md.chunk_index),
				content: String(md.content ?? ''),
				page_number: typeof md.page_number === 'number' ? md.page_number : null,
			};
		});
}

/** Removes every chunk of one document; returns how many ids were removed. */
export async function vectorizeDeleteDocument(env: Env, documentName: string): Promise<number> {
	const row = await env.DB.prepare('SELECT chunk_count FROM documents WHERE name = ?').bind(documentName).first<{ chunk_count: number }>();
	if (!row) return 0;
	const ids = await Promise.all(Array.from({ length: row.chunk_count }, (_, i) => vectorId(documentName, i)));
	for (let i = 0; i < ids.length; i += DELETE_BATCH) {
		await env.VECTORIZE.deleteByIds(ids.slice(i, i + DELETE_BATCH));
	}
	await env.DB.prepare('DELETE FROM documents WHERE name = ?').bind(documentName).run();
	return row.chunk_count;
}
