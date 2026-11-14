import { describe, expect, it } from 'vitest';
import { app } from './index.js';

const env = (vars: Record<string, string> = {}) => ({ ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', ALLOW_UNAUTHENTICATED: 'false', ANTHROPIC_API_KEY: '', ...vars });

describe('worker', () => {
	it('serves /api/health and reports unfinished setup', async () => {
		const res = await app.request('/api/health', {}, env());
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ status: 'ok', service: 'driveiq', access: 'access_not_configured', anthropic_key: 'missing' });
	});

	it('refuses API requests until Cloudflare Access is set up', async () => {
		const res = await app.request('/api/vehicle', {}, env());
		expect(res.status).toBe(503);
		expect(await res.json()).toMatchObject({ code: 'access_not_configured' });
	});
});
