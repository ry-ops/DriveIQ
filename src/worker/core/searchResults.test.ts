import { describe, expect, it } from 'vitest';
import type { SearchHit } from './embeddings.js';
import { mergeFollowUpResults, pageSources } from './searchResults.js';

const hit = (document_name: string, page_number: number | null, chunk_index: number, score: number): SearchHit => ({
	document_name,
	page_number,
	chunk_index,
	score,
	content: `${document_name} p${page_number} c${chunk_index}`,
});

describe('mergeFollowUpResults', () => {
	it("keeps the current question's own pages first (the defrost case)", () => {
		// "how do i turn on my defrost" on its own finds the climate pages…
		const own = [hit("Owner's Manual", 291, 1, 0.73), hit("Owner's Manual", 290, 2, 0.71)];
		// …while the search that also includes the previous shocks question
		// is dominated by maintenance documents.
		const followUp = [
			hit('Maintenance Audit Report', 1, 0, 0.74),
			hit("Owner's Manual", 290, 2, 0.71),
			hit('Warranty & Maintenance Guide', 52, 3, 0.72),
			hit('Warranty & Maintenance Guide', 44, 4, 0.71),
			hit('Warranty & Maintenance Guide', 40, 5, 0.71),
		];
		const merged = mergeFollowUpResults(own, followUp, 3);
		expect(merged.slice(0, 2)).toEqual(own);
		expect(merged.map((h) => `${h.document_name} p${h.page_number}`)).toEqual([
			"Owner's Manual p291",
			"Owner's Manual p290",
			'Maintenance Audit Report p1',
			'Warranty & Maintenance Guide p52',
			'Warranty & Maintenance Guide p44',
		]);
	});

	it('still gives a follow-up like "make it December 31" some context', () => {
		const merged = mergeFollowUpResults([], [hit('Warranty & Maintenance Guide', 40, 1, 0.7)]);
		expect(merged).toHaveLength(1);
	});
});

describe('pageSources', () => {
	it('shows each page once, keeping the best rank and score', () => {
		const sources = pageSources([
			hit('Maintenance Audit Report', 1, 0, 0.71),
			hit('Maintenance Audit Report', 1, 1, 0.74),
			hit('Maintenance Audit Report', 1, 2, 0.7),
			hit('Warranty & Maintenance Guide', 57, 0, 0.71),
		]);
		expect(sources.map((s) => `${s.document} p${s.page} ${s.relevance}`)).toEqual([
			'Maintenance Audit Report p1 0.74',
			'Warranty & Maintenance Guide p57 0.71',
		]);
		expect(sources[0].thumbnail_url).toBe('/api/pages/Maintenance%20Audit%20Report/1/thumbnail');
	});

	it('groups by document (best match first), then orders pages within each', () => {
		// The live defrost results, in score order, plus a second document.
		const sources = pageSources([
			hit("Owner's Manual", 273, 0, 0.73),
			hit("Owner's Manual", 291, 1, 0.72),
			hit('Warranty & Maintenance Guide', 57, 2, 0.715),
			hit("Owner's Manual", 284, 3, 0.71),
			hit("Owner's Manual", 290, 4, 0.7),
			hit('Warranty & Maintenance Guide', 40, 5, 0.69),
			hit("Owner's Manual", 282, 6, 0.69),
		]);
		expect(sources.map((s) => `${s.document} p${s.page}`)).toEqual([
			"Owner's Manual p273",
			"Owner's Manual p282",
			"Owner's Manual p284",
			"Owner's Manual p290",
			"Owner's Manual p291",
			'Warranty & Maintenance Guide p40',
			'Warranty & Maintenance Guide p57',
		]);
	});

	it('keeps chunks without a page number separate', () => {
		const sources = pageSources([hit('CARFAX Vehicle History Report', null, 0, 0.6), hit('CARFAX Vehicle History Report', null, 1, 0.6)]);
		expect(sources).toHaveLength(2);
		expect(sources[0]).not.toHaveProperty('thumbnail_url');
	});
});
