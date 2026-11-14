// DriveIQ: one Worker serving the app and its API. Requests for /api/* run
// this code (wrangler.jsonc "run_worker_first"); everything else is the
// built UI, served from static assets.

import { Hono } from 'hono';
import type { Env } from './env.js';
import { checkAccess } from './core/access.js';
import { vehicleRoutes } from './routes/vehicle.js';
import { maintenanceRoutes } from './routes/maintenance.js';
import { scheduleRoutes } from './routes/schedule.js';
import { reminderRoutes } from './routes/reminders.js';
import { searchRoutes } from './routes/search.js';
import { pagesRoutes } from './routes/pages.js';
import { vehicleSpecsRoutes } from './routes/vehicleSpecs.js';
import { recallsRoutes } from './routes/recalls.js';

const app = new Hono<{ Bindings: Env }>();

// Health check: says whether setup is finished, without exposing any data.
app.get('/api/health', async (c) => {
	const access = await checkAccess(c.req.raw, c.env);
	return c.json({
		status: 'ok',
		service: 'driveiq',
		version: '2.0.1',
		access: access.ok ? 'ok' : access.code,
		anthropic_key: c.env.ANTHROPIC_API_KEY ? 'set' : 'missing',
	});
});

// Everything else under /api needs a verified Cloudflare Access sign-in.
app.use('/api/*', async (c, next) => {
	const access = await checkAccess(c.req.raw, c.env);
	if (!access.ok) return c.json({ detail: access.detail, code: access.code }, access.status);
	await next();
});

app.route('/api/vehicle', vehicleRoutes);
app.route('/api/maintenance', maintenanceRoutes);
app.route('/api/schedule', scheduleRoutes);
app.route('/api/reminders', reminderRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/pages', pagesRoutes);
app.route('/api/vehicle-specs', vehicleSpecsRoutes);
app.route('/api/recalls', recallsRoutes);

app.all('/api/*', (c) => c.json({ detail: 'Not found' }, 404));

export { app };
export default app satisfies ExportedHandler<Env>;
