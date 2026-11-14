// Helpers for combining Aiana's document search results and turning them
// into the page thumbnails shown under an answer.

import type { SearchHit } from './embeddings.js';
import type { StoredSource } from './conversation.js';

const hitKey = (h: SearchHit) => `${h.document_name}\u0000${h.page_number ?? ''}\u0000${h.chunk_index}`;

/**
 * The current question's own results always come first. Results from a
 * search that also included the previous question are only added after
 * them (up to maxExtra new ones), so they can give a short follow-up
 * context without crowding out what was actually asked.
 */
export function mergeFollowUpResults(primary: SearchHit[], followUp: SearchHit[], maxExtra = 3): SearchHit[] {
	const seen = new Set(primary.map(hitKey));
	const extra = followUp.filter((h) => !seen.has(hitKey(h))).slice(0, maxExtra);
	return [...primary, ...extra];
}

/**
 * One thumbnail per page: several text chunks from the same page would
 * otherwise show the same page image several times. Keeps each page's
 * highest score.
 *
 * Display order: documents by their best match, then pages in page order
 * within each document, so a section reads front to back (e.g. defrost:
 * pp.273, 282, 284, 290…). Search scores within one section are usually
 * too close for score order to mean much. Only the thumbnails are
 * reordered — the model still gets excerpts best-match first.
 */
export function pageSources(hits: SearchHit[]): StoredSource[] {
	const byPage = new Map<string, StoredSource>();
	for (const h of hits) {
		const key = `${h.document_name}\u0000${h.page_number ?? `chunk-${h.chunk_index}`}`;
		const relevance = Math.round(h.score * 100) / 100;
		const existing = byPage.get(key);
		if (existing) {
			existing.relevance = Math.max(existing.relevance, relevance);
			continue;
		}
		byPage.set(key, {
			document: h.document_name,
			page: h.page_number,
			relevance,
			...(h.page_number
				? {
						thumbnail_url: `/api/pages/${encodeURIComponent(h.document_name)}/${h.page_number}/thumbnail`,
						fullsize_url: `/api/pages/${encodeURIComponent(h.document_name)}/${h.page_number}/full`,
					}
				: {}),
		});
	}
	const pages = [...byPage.values()];
	const docRank = new Map<string, number>();
	pages.forEach((p, i) => {
		if (!docRank.has(p.document)) docRank.set(p.document, i);
	});
	return pages.sort(
		(a, b) =>
			docRank.get(a.document)! - docRank.get(b.document)! ||
			(a.page ?? Number.MAX_SAFE_INTEGER) - (b.page ?? Number.MAX_SAFE_INTEGER)
	);
}
