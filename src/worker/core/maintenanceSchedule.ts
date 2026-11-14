// The maintenance schedule (D1 table `maintenance_schedule`, editable by the
// owner) and the forecast built from it. Gives Aiana deterministic "when is
// my next X due" answers instead of asking the model to do interval math.

export interface ScheduleItem {
	type: string;
	name: string;
	intervalMiles: number | null;
	intervalMonths: number | null;
}

interface ScheduleRow {
	type: string;
	name: string;
	interval_miles: number | null;
	interval_months: number | null;
}

export async function loadSchedule(db: D1Database): Promise<ScheduleItem[]> {
	const { results } = await db
		.prepare('SELECT type, name, interval_miles, interval_months FROM maintenance_schedule ORDER BY sort_order, name')
		.all<ScheduleRow>();
	return results.map((r) => ({ type: r.type, name: r.name, intervalMiles: r.interval_miles, intervalMonths: r.interval_months }));
}

export interface MaintenanceRecordRow {
	maintenance_type: string;
	date_performed: string;
	mileage: number;
}

export interface ServiceStatus {
	type: string;
	name: string;
	lastPerformedDate: string | null;
	lastPerformedMileage: number | null;
	dueMileage: number | null;
	milesRemaining: number | null;
	estimatedDueDate: string | null;
	status: 'overdue' | 'due_soon' | 'ok' | 'no_record';
}

function estimateDueDate(lastPerformedDate: string | null, intervalMonths: number | null): string | null {
	if (!lastPerformedDate || !intervalMonths) return null;
	const [y, m, d] = lastPerformedDate.split('-').map(Number);
	const due = new Date(Date.UTC(y, m - 1 + intervalMonths, d));
	return `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, '0')}-${String(due.getUTCDate()).padStart(2, '0')}`;
}

/** Builds per-type service status (last performed + next due, mileage and
 * estimated date) for every schedule item, using the most recent record of
 * each maintenance_type. Also includes any maintenance_type present in the
 * records that isn't in the schedule (e.g. one-off "service" /
 * "rustproofing" entries), so Aiana can still answer "when was my last X"
 * for those even though there's no interval to project forward. */
export function buildServiceStatus(
	schedule: ScheduleItem[],
	records: MaintenanceRecordRow[],
	currentMileage: number | null,
	dueSoonWindowMiles = 1000
): ServiceStatus[] {
	const latestByType = new Map<string, MaintenanceRecordRow>();
	for (const r of records) {
		const existing = latestByType.get(r.maintenance_type);
		if (!existing || r.date_performed > existing.date_performed) latestByType.set(r.maintenance_type, r);
	}

	const scheduled: ServiceStatus[] = schedule.map((item) => {
		const last = latestByType.get(item.type);
		latestByType.delete(item.type);
		const dueMileage = item.intervalMiles ? (last ? last.mileage + item.intervalMiles : item.intervalMiles) : null;
		const milesRemaining = currentMileage != null && dueMileage != null ? dueMileage - currentMileage : null;

		let status: ServiceStatus['status'] = 'no_record';
		if (last) {
			status = 'ok';
			if (milesRemaining != null) {
				if (milesRemaining <= 0) status = 'overdue';
				else if (milesRemaining <= dueSoonWindowMiles) status = 'due_soon';
			}
		}

		return {
			type: item.type,
			name: item.name,
			lastPerformedDate: last?.date_performed ?? null,
			lastPerformedMileage: last?.mileage ?? null,
			dueMileage,
			milesRemaining,
			estimatedDueDate: estimateDueDate(last?.date_performed ?? null, item.intervalMonths),
			status,
		};
	});

	// Any leftover types (not in the standard schedule) — no projection, just history.
	const unscheduled: ServiceStatus[] = [...latestByType.entries()].map(([type, last]) => ({
		type,
		name: type.replace(/_/g, ' '),
		lastPerformedDate: last.date_performed,
		lastPerformedMileage: last.mileage,
		dueMileage: last.mileage,
		milesRemaining: null,
		estimatedDueDate: null,
		status: 'ok',
	}));

	return [...scheduled, ...unscheduled];
}

/** Renders the service status list as a compact markdown table for the
 * system prompt. Includes the raw `type` slug (e.g. "coolant") alongside the
 * display name — Aiana needs the exact slug, not the name, when tagging a
 * reminder's maintenance_type to link it to one of these forecast rows. */
export function formatServiceStatusTable(statuses: ServiceStatus[]): string {
	const header = '| Service | Type | Last Performed | Next Due (mileage) | Next Due (est. date) | Status |\n|---|---|---|---|---|---|';
	const rows = statuses.map((s) => {
		const last = s.lastPerformedDate ? `${s.lastPerformedDate} @ ${s.lastPerformedMileage?.toLocaleString()} mi` : 'No record on file';
		const dueMi = s.status === 'no_record' || s.milesRemaining === null || s.dueMileage === null ? '—' : `${s.dueMileage.toLocaleString()} mi`;
		const dueDate = s.estimatedDueDate ?? '—';
		const statusLabel = { overdue: 'OVERDUE', due_soon: 'Due soon', ok: 'OK', no_record: 'Never logged' }[s.status];
		return `| ${s.name} | ${s.type} | ${last} | ${dueMi} | ${dueDate} | ${statusLabel} |`;
	});
	return [header, ...rows].join('\n');
}
