// The login check. DriveIQ holds personal records and spends your Anthropic
// key, so the API only answers requests that Cloudflare Access has signed
// in. Access puts a signed token in the Cf-Access-Jwt-Assertion header; this
// verifies it against your team's public keys and your application's AUD tag.
//
// It fails closed: until ACCESS_TEAM_DOMAIN and ACCESS_AUD are set, every API
// request is refused with a message saying how to finish setup. The only way
// around it is ALLOW_UNAUTHENTICATED = "true", for local development.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../env.js';

export type AccessResult =
	| { ok: true; email: string | null }
	| { ok: false; status: 401 | 403 | 503; code: 'access_not_configured' | 'not_signed_in' | 'invalid_token'; detail: string };

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** "your-team", "your-team.cloudflareaccess.com" or the full URL, all accepted. */
export function normalizeTeamDomain(value: string): string | null {
	let v = value.trim().replace(/\/+$/, '');
	if (!v) return null;
	if (!/^https?:\/\//.test(v)) v = `https://${v.includes('.') ? v : `${v}.cloudflareaccess.com`}`;
	try {
		const url = new URL(v);
		return url.protocol === 'https:' ? url.origin : null;
	} catch {
		return null;
	}
}

export async function checkAccess(request: Request, env: Env): Promise<AccessResult> {
	if (env.ALLOW_UNAUTHENTICATED === 'true') return { ok: true, email: null };

	const team = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN ?? '');
	const aud = (env.ACCESS_AUD ?? '').trim();
	if (!team || !aud) {
		return {
			ok: false,
			status: 503,
			code: 'access_not_configured',
			detail:
				'DriveIQ is locked until Cloudflare Access is set up. Turn on Access for this Worker, then set ACCESS_TEAM_DOMAIN and ACCESS_AUD in its settings (see docs/SETUP.md).',
		};
	}

	const token = request.headers.get('cf-access-jwt-assertion');
	if (!token) {
		return { ok: false, status: 401, code: 'not_signed_in', detail: 'Not signed in through Cloudflare Access.' };
	}

	let keys = keySets.get(team);
	if (!keys) {
		keys = createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`));
		keySets.set(team, keys);
	}
	try {
		const { payload } = await jwtVerify(token, keys, { issuer: team, audience: aud });
		return { ok: true, email: typeof payload.email === 'string' ? payload.email : null };
	} catch (err) {
		console.error('Access token rejected:', err instanceof Error ? err.message : err);
		return { ok: false, status: 403, code: 'invalid_token', detail: 'Your Cloudflare Access sign-in could not be verified. Sign in again.' };
	}
}
