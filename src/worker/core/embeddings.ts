// DriveIQ Cloud — embeddings and the shapes document search works with.
// Embeddings come from Workers AI (bge-base-en-v1.5, 768 dimensions) through
// the native AI binding, so there's no separate key. Search itself lives in
// vectorize.ts.

import type { Env } from '../env.js';

export interface DocumentChunk {
	document_name: string;
	chunk_index: number;
	content: string;
	page_number?: number;
}

export interface SearchHit {
	score: number;
	document_name: string;
	chunk_index: number;
	content: string;
	page_number: number | null;
}

/**
 * Whether document search can run. "unavailable" is kept separate from an
 * empty index so an outage never reads as "no documents".
 */
export type SearchStatus = { state: 'ready'; points_count: number } | { state: 'unavailable'; error: string };

interface BgeEmbeddingResponse {
	shape: [number, number];
	data: number[][];
}

export async function embed(env: Env, text: string): Promise<number[]> {
	const result = (await env.AI.run(env.EMBEDDING_MODEL as keyof AiModels, { text: [text] })) as BgeEmbeddingResponse;
	return result.data[0];
}

export async function embedBatch(env: Env, texts: string[]): Promise<number[][]> {
	const result = (await env.AI.run(env.EMBEDDING_MODEL as keyof AiModels, { text: texts })) as BgeEmbeddingResponse;
	return result.data;
}
