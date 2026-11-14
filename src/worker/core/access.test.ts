import { describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { Env } from '../env.js';
import { checkAccess, normalizeTeamDomain } from './access.js';

const TEAM = 'https://example-team.cloudflareaccess.com';
const AUD = 'test-aud-tag';
const env = (vars: Partial<Env>) => ({ ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', ALLOW_UNAUTHENTICATED: 'false', ...vars }) as Env;
const req = (token?: string) => new Request('https://driveiq.example/api/vehicle', { headers: token ? { 'cf-access-jwt-assertion': token } : {} });

describe('normalizeTeamDomain', () => {
	it('accepts a team name, a host or a full URL', () => {
		expect(normalizeTeamDomain('example-team')).toBe(TEAM);
		expect(normalizeTeamDomain('example-team.cloudflareaccess.com')).toBe(TEAM);
		expect(normalizeTeamDomain(`${TEAM}/`)).toBe(TEAM);
		expect(normalizeTeamDomain('')).toBeNull();
		expect(normalizeTeamDomain('http://example-team.cloudflareaccess.com')).toBeNull();
	});
});

describe('checkAccess', () => {
	it('fails closed when Access is not configured', async () => {
		const r = await checkAccess(req('anything'), env({}));
		expect(r).toMatchObject({ ok: false, status: 503, code: 'access_not_configured' });
	});

	it('only skips the check when ALLOW_UNAUTHENTICATED is exactly "true"', async () => {
		expect((await checkAccess(req(), env({ ALLOW_UNAUTHENTICATED: 'true' }))).ok).toBe(true);
		expect((await checkAccess(req(), env({ ALLOW_UNAUTHENTICATED: 'yes' }))).ok).toBe(false);
	});

	it('refuses a request with no Access token', async () => {
		const r = await checkAccess(req(), env({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD }));
		expect(r).toMatchObject({ ok: false, status: 401, code: 'not_signed_in' });
	});

	it("accepts a token signed by the team's key for this app, and refuses others", async () => {
		const { publicKey, privateKey } = await generateKeyPair('RS256');
		const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
		const realFetch = globalThis.fetch;
		globalThis.fetch = (async (url: string | URL) =>
			String(url) === `${TEAM}/cdn-cgi/access/certs` ? Response.json({ keys: [jwk] }) : new Response('no', { status: 404 })) as typeof fetch;
		try {
			const sign = (aud: string, iss = TEAM) =>
				new SignJWT({ email: 'owner@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);
			const e = env({ ACCESS_TEAM_DOMAIN: 'example-team', ACCESS_AUD: AUD });
			expect(await checkAccess(req(await sign(AUD)), e)).toEqual({ ok: true, email: 'owner@example.com' });
			expect(await checkAccess(req(await sign('another-app')), e)).toMatchObject({ ok: false, code: 'invalid_token' });
			expect(await checkAccess(req(await sign(AUD, 'https://other.cloudflareaccess.com')), e)).toMatchObject({ ok: false, code: 'invalid_token' });
		} finally {
			globalThis.fetch = realFetch;
		}
	});
});
