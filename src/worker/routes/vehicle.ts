// The vehicle. DriveIQ is single-owner, single-vehicle by design: "the"
// vehicle is the first row in `vehicles`, added on first run.

import { Hono } from 'hono';
import type { Env } from '../env.js';

export const vehicleRoutes = new Hono<{ Bindings: Env }>();

vehicleRoutes.get('/', async (c) => {
	const vehicle = await c.env.DB.prepare('SELECT * FROM vehicles LIMIT 1').first();
	if (!vehicle) return c.json({ detail: 'Vehicle not found' }, 404);
	return c.json(vehicle);
});

vehicleRoutes.post('/', async (c) => {
	const body = await c.req.json();
	for (const field of ['year', 'make', 'model']) {
		if (body[field] === undefined || body[field] === '') return c.json({ detail: `Missing field: ${field}` }, 400);
	}
	// Single-vehicle app: adding is a first-run step, not a second vehicle.
	if (await c.env.DB.prepare('SELECT id FROM vehicles LIMIT 1').first()) {
		return c.json({ detail: 'A vehicle is already set up. Edit it instead.' }, 409);
	}
	const vin = typeof body.vin === 'string' && body.vin.trim() ? body.vin.trim().toUpperCase() : null;

	const result = await c.env.DB.prepare(
		`INSERT INTO vehicles (vin, year, make, model, trim, engine, transmission, drivetrain,
		  color_exterior, color_interior, purchase_date, purchase_mileage, current_mileage)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 RETURNING *`
	)
		.bind(
			vin,
			body.year,
			body.make,
			body.model,
			body.trim ?? null,
			body.engine ?? null,
			body.transmission ?? null,
			body.drivetrain ?? null,
			body.color_exterior ?? null,
			body.color_interior ?? null,
			body.purchase_date ?? null,
			body.purchase_mileage ?? null,
			body.current_mileage ?? null
		)
		.first();

	return c.json(result, 201);
});

// Column allowlist for PATCH — mirrors VehicleUpdate in schemas/vehicle.py.
const UPDATABLE_FIELDS = ['current_mileage', 'color_exterior', 'color_interior'] as const;

vehicleRoutes.patch('/', async (c) => {
	const existing = await c.env.DB.prepare('SELECT * FROM vehicles LIMIT 1').first();
	if (!existing) return c.json({ detail: 'Vehicle not found' }, 404);

	const body = await c.req.json();
	const sets: string[] = [];
	const values: unknown[] = [];

	for (const field of UPDATABLE_FIELDS) {
		if (body[field] !== undefined) {
			sets.push(`${field} = ?`);
			values.push(body[field]);
		}
	}
	if (body.current_mileage !== undefined) {
		sets.push('last_mileage_update = ?');
		values.push(new Date().toISOString());
	}
	if (sets.length === 0) return c.json(existing);

	sets.push("updated_at = datetime('now')");
	values.push(existing.id);

	const updated = await c.env.DB.prepare(`UPDATE vehicles SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
		.bind(...values)
		.first();
	return c.json(updated);
});

vehicleRoutes.patch('/mileage/:mileage', async (c) => {
	const mileage = Number(c.req.param('mileage'));
	if (!Number.isFinite(mileage)) return c.json({ detail: 'Invalid mileage' }, 400);

	const existing = await c.env.DB.prepare('SELECT * FROM vehicles LIMIT 1').first();
	if (!existing) return c.json({ detail: 'Vehicle not found' }, 404);

	const updated = await c.env.DB.prepare(
		`UPDATE vehicles SET current_mileage = ?, last_mileage_update = ?, updated_at = datetime('now')
		 WHERE id = ? RETURNING *`
	)
		.bind(mileage, new Date().toISOString(), existing.id)
		.first();
	return c.json(updated);
});
