// Shared reminder-update logic — used by the reminders CRUD route
// (routes/reminders.ts, PATCH /api/reminders/:id) and by Aiana's
// update_reminder tool (routes/search.ts) so both editing paths stay in
// sync on which fields are editable and how they're written.

import type { Env } from '../env.js';

export const REMINDER_UPDATABLE_FIELDS = [
	'title',
	'description',
	'reminder_type',
	'due_date',
	'due_mileage',
	'category',
	'maintenance_type',
	'is_recurring',
	'recurrence_interval_days',
	'recurrence_interval_miles',
	'notify_days_before',
	'notify_miles_before',
] as const;

const BOOLEAN_FIELDS = new Set<string>(['is_recurring']);

// Applies whichever of REMINDER_UPDATABLE_FIELDS/is_active/is_completed are
// present (not undefined) in `body` to the reminder, and returns the updated
// row. Caller is responsible for confirming the reminder exists first.
export async function updateReminder(env: Env, id: number, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
	const sets: string[] = [];
	const values: unknown[] = [];

	for (const field of REMINDER_UPDATABLE_FIELDS) {
		if (body[field] === undefined) continue;
		sets.push(`${field} = ?`);
		values.push(BOOLEAN_FIELDS.has(field) ? (body[field] ? 1 : 0) : body[field]);
	}
	if (body.is_active !== undefined) {
		sets.push('is_active = ?');
		values.push(body.is_active ? 1 : 0);
	}
	if (body.is_completed !== undefined) {
		sets.push('is_completed = ?');
		values.push(body.is_completed ? 1 : 0);
		if (body.is_completed) {
			sets.push('completed_at = ?');
			values.push(new Date().toISOString());
		}
	}

	if (sets.length === 0) {
		return env.DB.prepare('SELECT * FROM reminders WHERE id = ?').bind(id).first();
	}

	sets.push("updated_at = datetime('now')");
	values.push(id);

	return env.DB.prepare(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
		.bind(...values)
		.first();
}

// Human-friendly reference for a reminder/appointment — e.g. "DR-2026-0042" —
// so the owner has something short to quote back (to a shop, or to Aiana)
// instead of the bare row id. Derived from the row's own id and created_at
// rather than stored: it's always in sync, needs no backfill for existing
// rows, and (since id is already unique) can't collide.
export function referenceNumber(id: number, createdAt: string): string {
	const year = createdAt.slice(0, 4);
	return `DR-${year}-${String(id).padStart(4, '0')}`;
}

// Adds `reference_number` to a reminder row (or passes null through) —
// every route response and every context/tool-result Aiana sees should be
// wrapped with this so the reference number is always present alongside id.
export function withReferenceNumber<T extends Record<string, unknown>>(row: T): T & { reference_number: string } {
	return { ...row, reference_number: referenceNumber(row.id as number, row.created_at as string) };
}

export function withReferenceNumbers<T extends Record<string, unknown>>(rows: T[]): (T & { reference_number: string })[] {
	return rows.map(withReferenceNumber);
}

// `maintenance_type` holds the set of MAINTENANCE_SCHEDULE types a reminder
// covers (a ticket can span more than one service — see the "differential +
// transfer case" case), stored JSON-encoded like maintenance_records' other
// multi-value columns (parts_used, documents, photos). A plain string is
// also accepted on read as a single-type value, for rows written before
// multi-type support existed.
export function parseMaintenanceTypes(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === 'string');
	} catch {
		// Not JSON — an old single-type value written before multi-type
		// support; treat the whole string as that one type.
	}
	return [raw];
}

export function serializeMaintenanceTypes(types: string[]): string | null {
	return types.length > 0 ? JSON.stringify(types) : null;
}
