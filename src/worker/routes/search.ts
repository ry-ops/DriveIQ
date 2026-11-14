// Aiana: search over the owner's uploaded documents (Vectorize) plus
// questions answered by Claude with the vehicle, service history, schedule,
// reminders, recalls and specs as context. Also the document list, the
// shared conversation, and the upload (ingest) endpoint.

import { Hono } from 'hono';
import type { Env } from '../env.js';
import { embedBatch, type SearchHit } from '../core/embeddings.js';
import { vectorizeDeleteDocument, vectorizeSearch, vectorizeStatus, vectorizeUpsert } from '../core/vectorize.js';
import { generateWithTools, answerText, type AnthropicContentBlock, type AnthropicTool, type LLMMessage } from '../core/anthropic.js';
import { buildServiceStatus, formatServiceStatusTable, loadSchedule, type MaintenanceRecordRow } from '../core/maintenanceSchedule.js';
import { updateReminder, referenceNumber, parseMaintenanceTypes, serializeMaintenanceTypes } from '../core/reminders.js';
import { mergeFollowUpResults, pageSources } from '../core/searchResults.js';
import { loadConversation, appendExchange, clearConversation, todayLine, IDLE_HOURS, type StoredSource } from '../core/conversation.js';

// Lets the owner add to What's Next in plain conversation — a booked visit
// ("I have an oil change booked for the 15th at the dealer") or a plain
// reminder ("remind me to replace the wiper blades before winter"). Aiana
// picks the category: 'appointment' rows skip the UI's "Ask Aiana" link
// (there's no manual page to look up for a booked visit), reminders keep it.
// The maintenance_type enum is the owner's schedule, so Aiana can only tag a
// reminder with a type the forecast actually recognizes.
const createReminderTool = (maintenanceTypes: string[]): AnthropicTool => ({
	name: 'create_reminder',
	description:
		"Add a reminder or appointment to the owner's \"What's Next\" list. Only call this when the owner is describing an actual scheduled visit or asking you to add a reminder (with a specific date and/or mileage), not when they're just asking a general maintenance question. If they haven't given you a date or mileage yet, ask them for one in your reply instead of calling this tool.",
	input_schema: {
		type: 'object',
		properties: {
			title: { type: 'string', description: 'Short title, e.g. "Oil Change" or "Tire Rotation at the dealer"' },
			category: {
				type: 'string',
				enum: ['appointment', 'reminder'],
				description:
					"'appointment' only when the owner has an actual booked visit (a shop, dealer, or set time). 'reminder' for anything else they want flagged by a date or mileage — including to-dos and projects. If you can't tell which they mean, ask before calling this tool.",
			},
			due_date: { type: 'string', description: 'ISO date (YYYY-MM-DD) the appointment is scheduled for, if known' },
			due_mileage: { type: 'number', description: 'Mileage the appointment is tied to, if the owner mentioned one' },
			description: { type: 'string', description: "Any extra detail the owner mentioned (location, reason, provider), if any" },
			maintenance_type: {
				type: 'array',
				items: { type: 'string', enum: maintenanceTypes },
				description:
					"List the standard service(s) this appointment covers, if any — e.g. one ticket combining Front Differential, Rear Differential, and Transfer Case service should list all three types. It tells the app this appointment already covers those forecasted services, so the forecast table stops showing separate (now redundant) projections for them. Leave unset/empty for anything that isn't one of these exact types (e.g. a one-off repair).",
			},
		},
		required: ['title', 'category'],
	},
});

// Lets the owner change an existing reminder in conversation ("push the
// front differential service back to 140,000 miles", "actually that oil
// change is done, no wait — just fix the date to the 12th") instead of
// having to open the reminder and edit it by hand. Aiana is given the
// current reminders list (see remindersContext below) so it can resolve
// which one the owner means and pass its id here.
const updateReminderTool = (maintenanceTypes: string[]): AnthropicTool => ({
	name: 'update_reminder',
	description:
		"Edit an existing reminder or appointment on the owner's \"What's Next\" list — change its title, description, due date/mileage, type, recurrence, category, maintenance_type, or notification lead time. Match it to one of the reminders listed in context (not the forecast table — those are projections with no id) and pass that reminder's id. Only call this when the owner is asking to change something about a reminder/appointment that already exists; use create_reminder instead for a brand-new one, and don't call this to mark a reminder done — that's a separate action the owner takes in the app. If the service they're asking about only shows up in the forecast table, there's nothing to edit yet — tell them so and offer to create a reminder instead. If the owner says a forecast item is now a duplicate of an appointment/reminder they already have (they scheduled it and it's showing as both an appointment and a separate overdue forecast), set maintenance_type on that existing reminder rather than creating a new one — that's what makes the duplicate forecast entry disappear.",
	input_schema: {
		type: 'object',
		properties: {
			reminder_id: { type: 'number', description: "The id of the existing reminder to edit, from the reminders list in context." },
			title: { type: 'string', description: 'New title, only if the owner wants it changed' },
			description: { type: 'string', description: 'New description, only if changed' },
			reminder_type: {
				type: 'string',
				enum: ['mileage', 'date', 'both'],
				description: 'Whether the reminder is tracked by mileage, date, or both — update to match whichever due_date/due_mileage are set',
			},
			due_date: { type: 'string', description: 'New ISO date (YYYY-MM-DD), only if changed' },
			due_mileage: { type: 'number', description: 'New due mileage, only if changed' },
			category: {
				type: 'string',
				enum: ['appointment', 'none'],
				description: "'appointment' to mark it as a scheduled appointment, 'none' to make it a normal reminder",
			},
			maintenance_type: {
				type: 'array',
				items: { type: 'string', enum: maintenanceTypes },
				description:
					'The full replacement list of standard service types this reminder/appointment covers — this hides the now-redundant forecast projection for each one listed. Use this when the owner points out that a forecast item (e.g. "Engine Coolant — Overdue") is a duplicate of an appointment they already scheduled: pass the existing list plus the newly matched type(s), not just the new one, since this replaces rather than appends. Pass an empty array to clear it entirely.',
			},
			is_recurring: { type: 'boolean', description: 'Whether this reminder should automatically recur after being completed' },
			recurrence_interval_days: { type: 'number', description: 'Days between recurrences, if recurring by date' },
			recurrence_interval_miles: { type: 'number', description: 'Miles between recurrences, if recurring by mileage' },
			notify_days_before: { type: 'number', description: 'How many days before the due date this should start surfacing as upcoming' },
			notify_miles_before: { type: 'number', description: 'How many miles before the due mileage this should start surfacing as upcoming' },
		},
		required: ['reminder_id'],
	},
});

export const searchRoutes = new Hono<{ Bindings: Env }>();

// Document ingestion, used by the UI's Upload document flow: the browser
// extracts and chunks the PDF's text, and the Worker embeds the chunks and
// stores them in Vectorize (Workers AI lives here, not in the browser).
searchRoutes.post('/ingest', async (c) => {
	const body = await c.req.json<{
		document_name: string;
		chunks: Array<{ content: string; chunk_index: number; page_number: number | null }>;
	}>();
	if (!body.document_name || !Array.isArray(body.chunks) || body.chunks.length === 0) {
		return c.json({ detail: 'document_name and chunks[] are required' }, 400);
	}

	const vectors = await embedBatch(c.env, body.chunks.map((ch) => ch.content));
	await vectorizeUpsert(
		c.env,
		body.chunks.map((ch, i) => ({
			document_name: body.document_name,
			chunk_index: ch.chunk_index,
			content: ch.content,
			page_number: ch.page_number ?? undefined,
			vector: vectors[i],
		}))
	);

	return c.json({ ingested: body.chunks.length });
});

searchRoutes.post('/', async (c) => {
	const body = await c.req.json<{ query: string; limit?: number }>();
	if (!body.query?.trim()) return c.json({ detail: 'query is required' }, 400);

	const status = await vectorizeStatus(c.env);
	if (status.state === 'unavailable') {
		return c.json({ detail: "Document search is unavailable right now (Vectorize can't be reached)." }, 503);
	}
	if (status.points_count === 0) {
		return c.json({ detail: 'No documents ingested yet' }, 404);
	}

	const results = await vectorizeSearch(c.env, body.query, body.limit ?? 5);
	return c.json(results);
});

// What Aiana can search (from the documents table, kept by vectorizeUpsert).
searchRoutes.get('/documents', async (c) => {
	const { results } = await c.env.DB.prepare('SELECT name, chunk_count, updated_at FROM documents ORDER BY name').all();
	return c.json(results);
});

// Removes one document from Aiana's search (all of its chunks). Used to
// retire a document, and before re-ingesting one: chunk ids are fixed per
// document and chunk number, so a shorter new version would otherwise leave
// the old version's extra chunks behind.
searchRoutes.delete('/documents/:name', async (c) => {
	const name = c.req.param('name');
	const removed = await vectorizeDeleteDocument(c.env, name);
	return c.json({ document_name: name, removed });
});

// The shared Aiana conversation (see core/conversation.ts): GET restores it
// on any device, DELETE is the UI's "New chat".
searchRoutes.get('/conversation', async (c) => c.json(await loadConversation(c.env)));

searchRoutes.delete('/conversation', async (c) => {
	await clearConversation(c.env);
	return c.json({ messages: [], expires_at: null });
});

searchRoutes.post('/ask', async (c) => {
	// remember: false is for background lookups (e.g. the What's Next card
	// spec previews) that shouldn't read or join the owner's conversation.
	const body = await c.req.json<{ query: string; remember?: boolean; timezone?: string }>();
	if (!body.query?.trim()) return c.json({ detail: 'query is required' }, 400);
	const remember = body.remember !== false;

	// Earlier turns of the shared conversation (empty if it went idle).
	const { messages: history } = remember ? await loadConversation(c.env) : { messages: [] };

	// A short follow-up ("make it December 31") may have nothing to search
	// the manuals with on its own, so it also gets a search that includes
	// the previous question. Those results only ever go after the current
	// question's own (see mergeFollowUpResults): a short new question
	// ("how do i turn on my defrost") must still find its own pages.
	const previousQuestion = [...history].reverse().find((m) => m.role === 'user')?.content;
	const followUpQuery =
		previousQuestion && body.query.trim().split(/\s+/).length <= 8 ? `${previousQuestion}\n${body.query}` : null;

	// Manual/document RAG search — optional. A collection that doesn't exist
	// yet or a query with no relevant chunks shouldn't block answering
	// service-history questions ("when was my last oil change?"), which need
	// no document context at all.
	//
	// limit=8, not 5: a narrow structured fact (e.g. one NHTSA VIN-decode
	// sentence confirming a feature isn't equipped) can score close to but
	// just below several topically-similar prose pages from a much longer
	// document (e.g. the Owner's Manual's "driving support systems"
	// section), which would otherwise fill every slot in a tighter cutoff
	// and silently exclude the chunk that actually answers the question.
	const status = await vectorizeStatus(c.env);
	let searchUnavailable = status.state === 'unavailable';
	let ownResults: SearchHit[] = [];
	let followUpResults: SearchHit[] = [];
	if (status.state === 'ready' && status.points_count > 0) {
		try {
			[ownResults, followUpResults] = await Promise.all([
				vectorizeSearch(c.env, body.query, 8, 0.35),
				followUpQuery ? vectorizeSearch(c.env, followUpQuery, 8, 0.35) : Promise.resolve([]),
			]);
		} catch (err) {
			console.error('Document search failed:', err instanceof Error ? err.message : err);
			searchUnavailable = true;
		}
	}
	const results = mergeFollowUpResults(ownResults, followUpResults);
	const searchUnavailableContext = searchUnavailable
		? "NOTE: Document search is unavailable right now, so the owner's manual and other documents could not be checked for this question. Say so plainly at the start of your answer, and don't imply the documents lack the information."
		: null;

	const docContext = results.length
		? results.map((r) => `[${r.document_name}${r.page_number ? `, p.${r.page_number}` : ''}]\n${r.content}`).join('\n\n---\n\n')
		: null;

	const vehicle = await c.env.DB.prepare('SELECT * FROM vehicles LIMIT 1').first<{
		id: number;
		year: number;
		make: string;
		model: string;
		trim: string | null;
		vin: string;
		current_mileage: number | null;
	}>();

	// Service history — always fetched, so Aiana can answer "when was my last
	// X" and "when is my next X due" for every maintenance type on file, not
	// just what's in the owner's manual.
	const { results: records } = vehicle
		? await c.env.DB.prepare(
				'SELECT maintenance_type, date_performed, mileage FROM maintenance_records WHERE vehicle_id = ? ORDER BY date_performed DESC'
			)
				.bind(vehicle.id)
				.all<MaintenanceRecordRow>()
		: { results: [] as MaintenanceRecordRow[] };

	// This is the same data the UI renders as "Forecast" cards — a
	// projection computed from the owner's schedule and service history,
	// not a reminder the owner (or Aiana) set. There is no database row
	// behind any of these entries, so they can't be edited with
	// update_reminder — only a real entry in the reminders list below can.
	const schedule = await loadSchedule(c.env.DB);
	const serviceHistoryContext =
		records.length > 0 || schedule.length > 0
			? `Forecast — projected next service due dates, computed from the owner's maintenance schedule (which they set to match their owner's manual) (current odometer: ${vehicle?.current_mileage?.toLocaleString() ?? 'unknown'} mi). Not reminders — there's no row to edit here, only to project from; "Type" is the slug to pass as maintenance_type when linking a reminder to one of these rows (see the reminders list below). "Status" is exactly one of OVERDUE (past due now), Due soon, OK (on schedule, not yet due), or Never logged (no service of this type on record) — always use this exact value rather than assuming a service is overdue or upcoming.\n\n${formatServiceStatusTable(buildServiceStatus(schedule, records, vehicle?.current_mileage ?? null))}`
			: null;

	// NHTSA recalls — fetched from the structured table, not left to
	// retrieval over an uploaded vehicle-history PDF. Semantic search only
	// returns its top-K most relevant chunks, so a broad question like "how
	// many recalls are there" was silently undercounting (missing whichever
	// campaigns didn't make the top 5). This table is the exact, complete
	// list every time.
	const { results: recalls } = vehicle
		? await c.env.DB.prepare(
				'SELECT nhtsa_campaign, component, summary, remedy, report_receipt_date, status FROM recalls WHERE vehicle_id = ? ORDER BY report_receipt_date DESC'
			)
				.bind(vehicle.id)
				.all<{
					nhtsa_campaign: string;
					component: string;
					summary: string;
					remedy: string | null;
					report_receipt_date: string | null;
					status: string;
				}>()
		: { results: [] };

	const recallsContext =
		recalls.length > 0
			? `NHTSA recalls for this vehicle's make, model and year (${recalls.length} total), from NHTSA's recall lookup. This is the complete list for the model year, not a partial search result. NHTSA doesn't say whether a recall was already done on this particular vehicle: "status" is what the owner has marked. For a definitive answer for their vehicle, suggest a VIN check at nhtsa.gov/recalls.\n\n${recalls
					.map(
						(r) =>
							`- ${r.nhtsa_campaign} (${r.component}), reported ${r.report_receipt_date ?? 'unknown date'}, status: ${r.status}\n  ${r.summary}${r.remedy ? `\n  Remedy: ${r.remedy}` : ''}`
					)
					.join('\n')}`
			: null;

	// Open reminders — given to Aiana so it can resolve which reminder the
	// owner means (e.g. "push the differential service back") and pass its
	// id to the update_reminder tool, and so it can answer "what's on my
	// reminders list" without a document search.
	const { results: reminderRows } = vehicle
		? await c.env.DB.prepare(
				`SELECT id, created_at, title, description, reminder_type, due_date, due_mileage, category, maintenance_type, is_recurring,
				        recurrence_interval_days, recurrence_interval_miles, notify_days_before, notify_miles_before
				 FROM reminders WHERE vehicle_id = ? AND is_active = 1 AND is_completed = 0
				 ORDER BY due_date IS NOT NULL, due_date ASC`
			)
				.bind(vehicle.id)
				.all<{
					id: number;
					created_at: string;
					title: string;
					description: string | null;
					reminder_type: string;
					due_date: string | null;
					due_mileage: number | null;
					category: string | null;
					maintenance_type: string | null;
					is_recurring: 0 | 1;
					recurrence_interval_days: number | null;
					recurrence_interval_miles: number | null;
					notify_days_before: number;
					notify_miles_before: number;
				}>()
		: { results: [] };

	// Labeled "Appointment"/"Reminder" to match the badge the UI shows on
	// each card — these are real rows the owner (or Aiana, via
	// create_reminder) explicitly set, distinct from the auto-computed
	// Forecast entries above. Only these have an id, so only these can be
	// passed to update_reminder. Each also carries its reference number
	// (e.g. "DR-2026-0042", same one shown on the card in the UI) so the
	// owner can quote that instead of a title — match it back to the id here
	// rather than guessing one.
	// Owner-confirmed specs (oil, tires, filters, part numbers). Exact numbers
	// the manual excerpts often don't carry, so Aiana should prefer these; each
	// keeps its source note.
	const { results: specRows } = vehicle
		? await c.env.DB.prepare(
				'SELECT maintenance_type, spec_text, part_number, source_note FROM vehicle_specs WHERE vehicle_id = ? ORDER BY maintenance_type'
			)
				.bind(vehicle.id)
				.all<{ maintenance_type: string; spec_text: string; part_number: string | null; source_note: string | null }>()
		: { results: [] as { maintenance_type: string; spec_text: string; part_number: string | null; source_note: string | null }[] };
	const specsContext =
		specRows.length > 0
			? `Vehicle specs confirmed by the owner. Prefer these for exact numbers (capacities, sizes, part numbers) over documentation excerpts, and pass on any caveat in the note.\n\n${specRows
					.map((s) => `- ${s.maintenance_type}: ${s.spec_text}${s.part_number ? ` (part ${s.part_number})` : ''}${s.source_note ? `\n  Note: ${s.source_note}` : ''}`)
					.join('\n')}`
			: null;

	const remindersContext =
		reminderRows.length > 0
			? `Reminders currently on the owner's "What's Next" list — each is either an Appointment (a specific scheduled visit) or a plain Reminder (a due point the owner or Aiana set without booking a visit). Use the id to edit one with the update_reminder tool; if the owner quotes a reference number instead of a title, match it against the ref shown here. A reminder tagged "covers: <type(s)>" already supersedes those forecast entries — one without a "covers" tag but whose title clearly matches a forecast item is a likely duplicate you should offer to link (set maintenance_type via update_reminder, passing its full covers list plus the new type — that field replaces, it doesn't append).\n\n${reminderRows
					.map((r) => {
						const due = [r.due_date ? `due ${r.due_date}` : null, r.due_mileage ? `${r.due_mileage.toLocaleString()} mi` : null]
							.filter(Boolean)
							.join(', ');
						const recurrence =
							r.is_recurring
								? ` (recurs every ${[
										r.recurrence_interval_days ? `${r.recurrence_interval_days} days` : null,
										r.recurrence_interval_miles ? `${r.recurrence_interval_miles} mi` : null,
									]
										.filter(Boolean)
										.join(' / ')})`
								: '';
						const ref = referenceNumber(r.id, r.created_at);
						const label = r.category === 'appointment' ? 'Appointment' : 'Reminder';
						const types = parseMaintenanceTypes(r.maintenance_type);
						const covers = types.length > 0 ? ` [covers: ${types.join(', ')}]` : '';
						return `- id ${r.id} (ref ${ref}): "${r.title}" [${label}, ${r.reminder_type}]${covers}${due ? ` — ${due}` : ''}${recurrence}${r.description ? `\n  ${r.description}` : ''}`;
					})
					.join('\n')}`
			: null;

	// One thumbnail per page, from the current question's own results (the
	// follow-up extras only inform the answer). Every matching chunk still
	// goes to the model.
	const sources: StoredSource[] = pageSources(ownResults.length > 0 ? ownResults : results);
	const expiresAt = new Date(Date.now() + IDLE_HOURS * 3600_000).toISOString();

	if (!docContext && !serviceHistoryContext && !recallsContext && !remindersContext && !specsContext && !searchUnavailable && history.length === 0) {
		const answer =
			"I couldn't find relevant information in your vehicle documentation or service history for this question. Try rephrasing, or consult your owner's manual directly.";
		if (remember) await appendExchange(c.env, body.query, answer, []);
		return c.json({ answer, sources: [], ...(remember ? { expires_at: expiresAt } : {}) });
	}

	const vehicleLine = vehicle
		? `You help answer questions about the owner's ${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}.`
		: 'You help answer questions about the owner\'s vehicle.';

	const system = `You are Aiana, an intelligent assistant for vehicle owners.
${vehicleLine}

Answer using the provided documentation, forecast table, recalls list, and/or reminders list below, whichever is relevant to the question. Be concise, practical, and safety-focused.
Today's date is given at the top of the context below. Use it to turn relative dates ("next Friday", "end of next month") into exact YYYY-MM-DD dates, to judge what's overdue or upcoming, and never suggest a date that has already passed.
Earlier messages in this conversation are included so you can follow up on them (e.g. the owner answering a question you asked). Facts like reminders, service history, and mileage may have changed since then — always use the current context below for those, not an earlier reply.
When asked about a past service (e.g. "when was my last oil change"), answer from the forecast table's service history, then proactively add when the *next* one of that same service is due (mileage and/or estimated date) using the "Next Due" columns — don't make the owner ask a second question for that.
If a service has never been logged ("Never logged" status), say so plainly rather than guessing a date.
When asked about recalls (e.g. "how many recalls", "is there an open recall"), always answer from the NHTSA recalls list below, never from a CARFAX report's own "no open recalls reported to CARFAX" line — CARFAX's recall data feed is separate from NHTSA's and is frequently incomplete or stale, so that specific claim must be ignored even if it's the retrieved documentation's most relevant-looking match. The NHTSA recalls list is the complete, exact set for this vehicle's make, model and year; if it's absent from the context below, say recall data isn't available rather than trusting a CARFAX summary line.
If neither source fully answers the question, say what you found and suggest checking the full manual or logging the service.
If the documentation excerpts don't answer the question, say so plainly. Don't suggest the answer might be in parts of a document you weren't shown, and only point the owner to a specific page when an excerpt actually points there.
When you cite a schedule or manual item, say exactly what that page lists and cite it (e.g. "the 60,000-mile service includes inspecting ball joints and dust covers — Warranty & Maintenance Guide p.46"); don't widen it to a different part. Label general advice as general, not as the owner's schedule.
If the owner describes a booked service visit or asks you to add a reminder (with a specific date and/or mileage), use the create_reminder tool to add it for them — don't just say you will, actually call the tool. Set its category: 'appointment' only for an actual booked visit, 'reminder' for everything else (including to-dos and projects).
If the owner asks to change, reschedule, correct, rename, or otherwise edit something about a reminder that's already on their list (see the reminders list below), use the update_reminder tool with that reminder's id and only the fields that should change — don't call create_reminder for an edit, and don't just describe the change without calling the tool. If you can't tell which reminder they mean, ask instead of guessing.
Every reminder/appointment has a short reference number (e.g. "DR-2026-0042", shown on its card in the app and listed next to its id below). After create_reminder or update_reminder succeeds, mention that reference number in your reply. If the owner quotes one back to you instead of a title, match it against the ref shown in the reminders list below rather than asking them to repeat the title.

Verify categorization before you act or answer — these are easy to conflate, and getting them wrong misleads the owner about what's actually scheduled:
- Reminder vs. Appointment: both are real rows in the reminders list, distinguished only by whether the owner has an actual booked visit (Appointment) or just a due point they want flagged (Reminder). If it's not clear which the owner means when creating one, ask.
- Reminder/Appointment vs. Forecast: the reminders list is owner- (or Aiana-) set rows with an id; the forecast table is an automatic projection with no row behind it. If the owner refers to "my reminder" or "my appointment" for a service type that only appears in the forecast table (no matching entry in the reminders list), say plainly that there's no reminder set for it yet — it's only a projected due date — and ask if they'd like you to create one, rather than treating the forecast entry as if it were an editable reminder.
- Duplicate forecast entries: there's no way to delete a forecast projection directly — it's recomputed from the maintenance schedule and service history every time, not a row. What *does* make one disappear is tagging the appointment/reminder that now covers it with maintenance_type (matching the forecast item's type, e.g. 'coolant'). It's a list — one ticket can cover several services at once (e.g. front differential, rear differential, and transfer case fluid all in the same visit), so when adding a type, pass the reminder's existing covers list plus the new one(s), not just the new one — update_reminder replaces the whole list rather than appending. If the owner says a forecast item (e.g. "Engine Coolant — Overdue") is now a duplicate because they already scheduled an appointment for it, don't say you can't remove it and stop there — find that reminder in the list below and call update_reminder with maintenance_type set so the duplicate stops showing. Only create_reminder/update_reminder set this — the owner can't do it from the UI, so do it for them once you've confirmed which reminder and which forecast type(s) match.
- The forecast comes from the owner's own schedule, which starts from general intervals. If a forecast interval disagrees with the owner's manual excerpts, point that out and suggest updating the schedule in Settings.
- Overdue vs. next scheduled: always take this from the actual Status value (forecast table) or due_date/due_mileage vs. current mileage/today (reminders list) — never infer it from how the owner phrases the question. If their phrasing assumes a status the data doesn't support (e.g. they call something "overdue" that the forecast table shows as OK, or ask about "the overdue one" when several services are overdue), point out the mismatch or ask which one they mean instead of going along with the assumption.`;

	const contextParts = [
		// Recalls and service history first — these are exact, structured facts
		// that should win over anything semantically similar retrieved from
		// document RAG (e.g. a CARFAX report's own "no open recalls reported to
		// CARFAX" boilerplate, which is a different, less complete data source
		// than the NHTSA recalls list and has previously caused the model to
		// answer from the wrong source when doc context also mentions recalls).
		todayLine(body.timezone),
		searchUnavailableContext,
		recallsContext,
		serviceHistoryContext,
		remindersContext,
		specsContext,
		docContext ? `Context from vehicle documentation:\n${docContext}` : null,
	].filter((p): p is string => p !== null);

	// Earlier turns as plain text, then the current question with fresh context.
	const messages: LLMMessage[] = [
		...history.map((m) => ({ role: m.role, content: m.content })),
		{ role: 'user', content: `${contextParts.join('\n\n---\n\n')}\n\nQuestion: ${body.query}` },
	];

	const scheduleTypes = schedule.map((s) => s.type);
	const tools = [createReminderTool(scheduleTypes), updateReminderTool(scheduleTypes)];
	const first = await generateWithTools(c.env, { system, messages, tools });

	const toolUses = first.content.filter((b) => b.type === 'tool_use');
	let answer: string;
	let reminderCreated = false;
	let reminderUpdated = false;

	if (first.stop_reason === 'tool_use' && toolUses.length > 0) {
		const toolResults: AnthropicContentBlock[] = [];

		for (const toolUse of toolUses) {
			if (toolUse.name === 'create_reminder') {
				const input = toolUse.input as {
					title: string;
					due_date?: string;
					due_mileage?: number;
					description?: string;
					maintenance_type?: string[];
					category?: 'appointment' | 'reminder';
				};
				// Default to a plain reminder; 'appointment' only when Aiana says so.
				const category = input.category === 'appointment' ? 'appointment' : null;
				const reminderType = input.due_date && input.due_mileage ? 'both' : input.due_mileage ? 'mileage' : 'date';

				let createdRef: string | null = null;
				if (vehicle) {
					const inserted = await c.env.DB.prepare(
						`INSERT INTO reminders (vehicle_id, title, description, reminder_type, due_date, due_mileage, category, maintenance_type, notify_days_before, notify_miles_before)
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 7, 500)
						 RETURNING id, created_at`
					)
						.bind(
							vehicle.id,
							input.title,
							input.description ?? null,
							reminderType,
							input.due_date ?? null,
							input.due_mileage ?? null,
							category,
							serializeMaintenanceTypes(input.maintenance_type ?? [])
						)
						.first<{ id: number; created_at: string }>();
					reminderCreated = true;
					if (inserted) createdRef = referenceNumber(inserted.id, inserted.created_at);
				}

				toolResults.push({
					type: 'tool_result',
					tool_use_id: toolUse.id!,
					content: reminderCreated
						? `Added "${input.title}" to the owner's What's Next list (reference ${createdRef}). Mention this reference number in your reply so the owner has it.`
						: 'Could not add the reminder — no vehicle on record.',
				});
			} else if (toolUse.name === 'update_reminder') {
				const input = toolUse.input as {
					reminder_id: number;
					title?: string;
					description?: string;
					reminder_type?: 'mileage' | 'date' | 'both';
					due_date?: string;
					due_mileage?: number;
					category?: 'appointment' | 'none';
					maintenance_type?: string[];
					is_recurring?: boolean;
					recurrence_interval_days?: number;
					recurrence_interval_miles?: number;
					notify_days_before?: number;
					notify_miles_before?: number;
				};

				const existing = vehicle
					? await c.env.DB.prepare('SELECT id, created_at, title FROM reminders WHERE id = ? AND vehicle_id = ?')
							.bind(input.reminder_id, vehicle.id)
							.first<{ id: number; created_at: string; title: string }>()
					: null;

				let toolResultText: string;
				if (!existing) {
					toolResultText = `No reminder with id ${input.reminder_id} was found — nothing was changed. If this id was guessed rather than taken from the reminders list, tell the owner there's no reminder set for that service (it may only be a forecast projection) and ask if they'd like one created.`;
				} else {
					const { reminder_id, category, maintenance_type, ...rest } = input;
					await updateReminder(c.env, existing.id, {
						...rest,
						...(category !== undefined ? { category: category === 'none' ? null : category } : {}),
						...(maintenance_type !== undefined ? { maintenance_type: serializeMaintenanceTypes(maintenance_type) } : {}),
					});
					reminderUpdated = true;
					const ref = referenceNumber(existing.id, existing.created_at);
					toolResultText = `Updated "${existing.title}" (reference ${ref}). Mention this reference number in your reply so the owner has it.`;
				}

				toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id!, content: toolResultText });
			}
		}

		const followup = await generateWithTools(c.env, {
			system,
			// first.content goes back unchanged, thinking blocks included.
			messages: [...messages, { role: 'assistant', content: first.content }, { role: 'user', content: toolResults }],
			tools,
		});
		answer = answerText(followup);
	} else {
		answer = answerText(first);
	}

	if (remember) await appendExchange(c.env, body.query, answer, sources);

	return c.json({
		answer,
		reminder_created: reminderCreated,
		reminder_updated: reminderUpdated,
		sources,
		...(remember ? { expires_at: expiresAt } : {}),
	});
});
