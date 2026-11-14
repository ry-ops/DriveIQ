// Exact specs the owner has confirmed (oil type and capacity, tire size,
// filters, part numbers), one per maintenance type. Aiana prefers these over
// anything it finds in documents.

import { Hono } from 'hono';
import type { Env } from '../env.js';

export const vehicleSpecsRoutes = new Hono<{ Bindings: Env }>();

vehicleSpecsRoutes.get('/', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT * FROM vehicle_specs').all();
	return c.json(results);
});

vehicleSpecsRoutes.post('/', async (c) => {
	const body = await c.req.json<{
		vehicle_id: number;
		maintenance_type: string;
		spec_text: string;
		part_number?: string;
		source_note?: string;
	}>();
	if (!body.vehicle_id || !body.maintenance_type || !body.spec_text) {
		return c.json({ detail: 'vehicle_id, maintenance_type, and spec_text are required' }, 400);
	}

	const row = await c.env.DB.prepare(
		`INSERT INTO vehicle_specs (vehicle_id, maintenance_type, spec_text, part_number, source_note)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(vehicle_id, maintenance_type) DO UPDATE SET
		   spec_text = excluded.spec_text,
		   part_number = excluded.part_number,
		   source_note = excluded.source_note,
		   updated_at = datetime('now')
		 RETURNING *`
	)
		.bind(body.vehicle_id, body.maintenance_type, body.spec_text, body.part_number ?? null, body.source_note ?? null)
		.first();

	return c.json(row, 201);
});

vehicleSpecsRoutes.delete('/:id{[0-9]+}', async (c) => {
	const result = await c.env.DB.prepare('DELETE FROM vehicle_specs WHERE id = ?').bind(Number(c.req.param('id'))).run();
	if (!result.meta.changes) return c.json({ detail: 'Not found' }, 404);
	return c.json({ message: 'Spec removed' });
});
