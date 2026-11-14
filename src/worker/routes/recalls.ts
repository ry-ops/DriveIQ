// Recalls for the vehicle's make, model and year, from NHTSA's public recall
// API (POST /check). NHTSA lists every recall for the model year; whether a
// recall was already done on this particular vehicle isn't in that data, so
// each starts "open" and the owner marks it remedied. A VIN check at
// nhtsa.gov/recalls is the authoritative per-vehicle answer.

import { Hono } from 'hono';
import type { Env } from '../env.js';

export const recallsRoutes = new Hono<{ Bindings: Env }>();

recallsRoutes.get('/', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT * FROM recalls ORDER BY report_receipt_date DESC').all();
	return c.json(results);
});

recallsRoutes.post('/', async (c) => {
	const body = await c.req.json<{
		vehicle_id: number;
		nhtsa_campaign: string;
		component: string;
		summary: string;
		consequence?: string;
		remedy?: string;
		report_receipt_date?: string;
		status?: 'open' | 'remedied';
	}>();
	if (!body.vehicle_id || !body.nhtsa_campaign || !body.component || !body.summary) {
		return c.json({ detail: 'vehicle_id, nhtsa_campaign, component, and summary are required' }, 400);
	}

	const row = await c.env.DB.prepare(
		`INSERT INTO recalls (vehicle_id, nhtsa_campaign, component, summary, consequence, remedy, report_receipt_date, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'open'))
		 ON CONFLICT(nhtsa_campaign) DO UPDATE SET
		   component = excluded.component,
		   summary = excluded.summary,
		   consequence = excluded.consequence,
		   remedy = excluded.remedy,
		   report_receipt_date = excluded.report_receipt_date,
		   updated_at = datetime('now')
		 RETURNING *`
	)
		.bind(
			body.vehicle_id,
			body.nhtsa_campaign,
			body.component,
			body.summary,
			body.consequence ?? null,
			body.remedy ?? null,
			body.report_receipt_date ?? null,
			body.status ?? null
		)
		.first();

	return c.json(row, 201);
});

interface NhtsaRecall {
	NHTSACampaignNumber: string;
	Component: string;
	Summary: string;
	Consequence?: string;
	Remedy?: string;
	ReportReceivedDate?: string; // DD/MM/YYYY
}

/** NHTSA's DD/MM/YYYY to YYYY-MM-DD (null if it isn't in that shape). */
export function nhtsaDate(value: string | undefined): string | null {
	const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Looks up recalls for the vehicle on file and stores any new ones. Keeps the
// owner's "remedied" marks on recalls already in the table.
recallsRoutes.post('/check', async (c) => {
	const vehicle = await c.env.DB.prepare('SELECT id, year, make, model FROM vehicles LIMIT 1').first<{
		id: number;
		year: number;
		make: string;
		model: string;
	}>();
	if (!vehicle) return c.json({ detail: 'Add your vehicle first.' }, 400);

	const url = new URL('https://api.nhtsa.gov/recalls/recallsByVehicle');
	url.searchParams.set('make', vehicle.make);
	url.searchParams.set('model', vehicle.model);
	url.searchParams.set('modelYear', String(vehicle.year));
	const res = await fetch(url, { headers: { Accept: 'application/json' } });
	if (!res.ok) return c.json({ detail: `NHTSA's recall lookup didn't answer (HTTP ${res.status}). Try again later.` }, 502);
	const data = (await res.json()) as { results?: NhtsaRecall[] };
	const found = (data.results ?? []).filter((r) => r.NHTSACampaignNumber && r.Component && r.Summary);

	if (found.length > 0) {
		await c.env.DB.batch(
			found.map((r) =>
				c.env.DB.prepare(
					`INSERT INTO recalls (vehicle_id, nhtsa_campaign, component, summary, consequence, remedy, report_receipt_date)
					 VALUES (?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT(nhtsa_campaign) DO UPDATE SET component = excluded.component, summary = excluded.summary,
					   consequence = excluded.consequence, remedy = excluded.remedy,
					   report_receipt_date = excluded.report_receipt_date, updated_at = datetime('now')`
				).bind(vehicle.id, r.NHTSACampaignNumber, r.Component, r.Summary, r.Consequence ?? null, r.Remedy ?? null, nhtsaDate(r.ReportReceivedDate))
			)
		);
	}
	const { results } = await c.env.DB.prepare('SELECT * FROM recalls ORDER BY report_receipt_date DESC').all();
	return c.json({ checked: `${vehicle.year} ${vehicle.make} ${vehicle.model}`, found: found.length, recalls: results });
});

recallsRoutes.patch('/:id{[0-9]+}', async (c) => {
	const id = Number(c.req.param('id'));
	const body = await c.req.json<{ status: 'open' | 'remedied' }>();
	if (body.status !== 'open' && body.status !== 'remedied') {
		return c.json({ detail: "status must be 'open' or 'remedied'" }, 400);
	}

	const row = await c.env.DB.prepare(
		`UPDATE recalls SET status = ?, updated_at = datetime('now') WHERE id = ? RETURNING *`
	)
		.bind(body.status, id)
		.first();
	if (!row) return c.json({ detail: 'Recall not found' }, 404);

	return c.json(row);
});
