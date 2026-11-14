// Service history: one row per service performed. Logging a service also
// moves matching recurring reminders forward and updates the odometer.

import { Hono } from 'hono';
import type { Env } from '../env.js';

export const maintenanceRoutes = new Hono<{ Bindings: Env }>();

async function syncRemindersWithMaintenance(
	db: D1Database,
	vehicleId: number,
	maintenanceType: string,
	mileage: number
): Promise<number> {
	const { results: reminders } = await db
		.prepare('SELECT * FROM reminders WHERE vehicle_id = ? AND is_active = 1 AND is_completed = 0')
		.bind(vehicleId)
		.all();

	let updatedCount = 0;
	const typeLower = maintenanceType.toLowerCase();

	for (const reminder of reminders as any[]) {
		const titleLower = String(reminder.title).toLowerCase();
		const isMatch = typeLower.includes(titleLower) || titleLower.includes(typeLower);
		if (!isMatch) continue;

		if (reminder.is_recurring && reminder.recurrence_interval_miles) {
			const newDueMileage = mileage + reminder.recurrence_interval_miles;
			let newDueDate = reminder.due_date;
			if (reminder.recurrence_interval_days && reminder.due_date) {
				const d = new Date(reminder.due_date);
				d.setDate(d.getDate() + reminder.recurrence_interval_days);
				newDueDate = d.toISOString().slice(0, 10);
			}
			await db
				.prepare("UPDATE reminders SET due_mileage = ?, due_date = ?, updated_at = datetime('now') WHERE id = ?")
				.bind(newDueMileage, newDueDate, reminder.id)
				.run();
		} else {
			await db
				.prepare(
					"UPDATE reminders SET is_completed = 1, completed_at = ?, updated_at = datetime('now') WHERE id = ?"
				)
				.bind(new Date().toISOString(), reminder.id)
				.run();
		}
		updatedCount++;
	}

	const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ?').bind(vehicleId).first();
	if (vehicle && mileage > ((vehicle.current_mileage as number) ?? 0)) {
		await db.prepare("UPDATE vehicles SET current_mileage = ?, updated_at = datetime('now') WHERE id = ?").bind(mileage, vehicleId).run();
	}

	return updatedCount;
}

maintenanceRoutes.get('/', async (c) => {
	const maintenanceType = c.req.query('maintenance_type');
	const skip = Number(c.req.query('skip') ?? 0);
	const limit = Number(c.req.query('limit') ?? 100);

	let sql = 'SELECT * FROM maintenance_records';
	const params: unknown[] = [];
	if (maintenanceType) {
		sql += ' WHERE maintenance_type = ?';
		params.push(maintenanceType);
	}
	sql += ' ORDER BY date_performed DESC LIMIT ? OFFSET ?';
	params.push(limit, skip);

	const { results } = await c.env.DB.prepare(sql).bind(...params).all();
	return c.json(results);
});

// Registered before /:id — literal segment, not a record id.
maintenanceRoutes.get('/types/summary', async (c) => {
	const { results } = await c.env.DB.prepare(
		`SELECT maintenance_type AS type,
		        COUNT(id) AS count,
		        COALESCE(SUM(cost), 0) AS total_cost,
		        MAX(date_performed) AS last_performed,
		        MAX(mileage) AS last_mileage
		 FROM maintenance_records
		 GROUP BY maintenance_type`
	).all();
	return c.json(results);
});

maintenanceRoutes.get('/:id{[0-9]+}', async (c) => {
	const id = Number(c.req.param('id'));
	const record = await c.env.DB.prepare('SELECT * FROM maintenance_records WHERE id = ?').bind(id).first();
	if (!record) return c.json({ detail: 'Maintenance record not found' }, 404);
	return c.json(record);
});

maintenanceRoutes.post('/', async (c) => {
	const body = await c.req.json();
	const required = ['vehicle_id', 'maintenance_type', 'date_performed', 'mileage'];
	for (const field of required) {
		if (body[field] === undefined) return c.json({ detail: `Missing field: ${field}` }, 400);
	}

	const record = await c.env.DB.prepare(
		`INSERT INTO maintenance_records
		  (vehicle_id, maintenance_type, description, date_performed, mileage, cost, parts_cost,
		   labor_cost, service_provider, location, parts_used, notes, documents, photos)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 RETURNING *`
	)
		.bind(
			body.vehicle_id,
			body.maintenance_type,
			body.description ?? null,
			body.date_performed,
			body.mileage,
			body.cost ?? null,
			body.parts_cost ?? null,
			body.labor_cost ?? null,
			body.service_provider ?? null,
			body.location ?? null,
			body.parts_used ?? null,
			body.notes ?? null,
			body.documents ?? null,
			body.photos ?? null
		)
		.first();

	await syncRemindersWithMaintenance(c.env.DB, body.vehicle_id, body.maintenance_type, body.mileage);

	return c.json(record, 201);
});

const UPDATABLE_FIELDS = [
	'maintenance_type',
	'description',
	'date_performed',
	'mileage',
	'cost',
	'parts_cost',
	'labor_cost',
	'service_provider',
	'location',
	'parts_used',
	'notes',
	'documents',
	'photos',
] as const;

maintenanceRoutes.patch('/:id{[0-9]+}', async (c) => {
	const id = Number(c.req.param('id'));
	const existing = await c.env.DB.prepare('SELECT * FROM maintenance_records WHERE id = ?').bind(id).first();
	if (!existing) return c.json({ detail: 'Maintenance record not found' }, 404);

	const body = await c.req.json();
	const sets: string[] = [];
	const values: unknown[] = [];
	for (const field of UPDATABLE_FIELDS) {
		if (body[field] !== undefined) {
			sets.push(`${field} = ?`);
			values.push(body[field]);
		}
	}
	if (sets.length === 0) return c.json(existing);

	sets.push("updated_at = datetime('now')");
	values.push(id);

	const updated = await c.env.DB.prepare(`UPDATE maintenance_records SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
		.bind(...values)
		.first();

	const mileageChanged = body.mileage !== undefined && body.mileage !== existing.mileage;
	const typeChanged = body.maintenance_type !== undefined && body.maintenance_type !== existing.maintenance_type;
	if (mileageChanged || typeChanged) {
		await syncRemindersWithMaintenance(
			c.env.DB,
			updated!.vehicle_id as number,
			updated!.maintenance_type as string,
			updated!.mileage as number
		);
	}

	return c.json(updated);
});

maintenanceRoutes.delete('/:id{[0-9]+}', async (c) => {
	const id = Number(c.req.param('id'));
	const existing = await c.env.DB.prepare('SELECT id FROM maintenance_records WHERE id = ?').bind(id).first();
	if (!existing) return c.json({ detail: 'Maintenance record not found' }, 404);

	await c.env.DB.prepare('DELETE FROM maintenance_records WHERE id = ?').bind(id).run();
	return c.json({ message: 'Maintenance record deleted' });
});
