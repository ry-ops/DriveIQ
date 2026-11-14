// The owner's maintenance schedule: which services to track and how often.
// Starts with general intervals (migrations/0001_init.sql); the owner edits
// it to match their owner's manual.

import { Hono } from 'hono';
import type { Env } from '../env.js';

export const scheduleRoutes = new Hono<{ Bindings: Env }>();

interface ScheduleInput {
	name?: string;
	interval_miles?: number | null;
	interval_months?: number | null;
	sort_order?: number;
}

const positiveOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : NaN);

scheduleRoutes.get('/', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT * FROM maintenance_schedule ORDER BY sort_order, name').all();
	return c.json(results);
});

// Adds a service, or updates it if the type already exists.
scheduleRoutes.put('/:type', async (c) => {
	const type = c.req.param('type');
	if (!/^[a-z0-9_]{2,40}$/.test(type)) return c.json({ detail: 'type must be lowercase letters, digits and _' }, 400);
	const body = await c.req.json<ScheduleInput>();
	const miles = positiveOrNull(body.interval_miles);
	const months = positiveOrNull(body.interval_months);
	if (Number.isNaN(miles) || Number.isNaN(months)) return c.json({ detail: 'intervals must be positive whole numbers or empty' }, 400);
	if (miles === null && months === null) return c.json({ detail: 'set a mileage interval, a time interval, or both' }, 400);

	const existing = await c.env.DB.prepare('SELECT name, sort_order FROM maintenance_schedule WHERE type = ?').bind(type).first<{ name: string; sort_order: number }>();
	const name = (body.name ?? existing?.name ?? '').trim();
	if (!name) return c.json({ detail: 'name is required for a new service' }, 400);
	const sortOrder = body.sort_order ?? existing?.sort_order ?? 1000;

	await c.env.DB.prepare(
		`INSERT INTO maintenance_schedule (type, name, interval_miles, interval_months, sort_order, updated_at)
		 VALUES (?, ?, ?, ?, ?, datetime('now'))
		 ON CONFLICT(type) DO UPDATE SET name = excluded.name, interval_miles = excluded.interval_miles,
		   interval_months = excluded.interval_months, sort_order = excluded.sort_order, updated_at = datetime('now')`
	)
		.bind(type, name, miles, months, sortOrder)
		.run();
	return c.json(await c.env.DB.prepare('SELECT * FROM maintenance_schedule WHERE type = ?').bind(type).first());
});

scheduleRoutes.delete('/:type', async (c) => {
	const result = await c.env.DB.prepare('DELETE FROM maintenance_schedule WHERE type = ?').bind(c.req.param('type')).run();
	if (!result.meta.changes) return c.json({ detail: 'Not found' }, 404);
	return c.json({ message: 'Removed from the schedule. Past records of this service are kept.' });
});
