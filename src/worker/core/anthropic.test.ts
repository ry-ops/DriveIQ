import { describe, expect, it } from 'vitest';
import type { Env } from '../env.js';
import { answerText, generateWithTools, type AnthropicResponse } from './anthropic.js';

function fakeEnv(reply: AnthropicResponse, status = 200) {
	const calls: { gatewayId: string; request: AIGatewayUniversalRequest }[] = [];
	const env = {
		AI_GATEWAY_ID: 'driveiq',
		CLAUDE_MODEL: 'claude-haiku-5-5',
		CLAUDE_EFFORT: 'medium',
		ANTHROPIC_API_KEY: 'test-key',
		AI: {
			gateway: (gatewayId: string) => ({
				run: async (request: AIGatewayUniversalRequest) => {
					calls.push({ gatewayId, request });
					return new Response(JSON.stringify(reply), { status });
				},
			}),
		},
	} as unknown as Env;
	return { env, calls };
}

describe('anthropic client via AI Gateway', () => {
	it('sends the Messages request through the configured gateway', async () => {
		const { env, calls } = fakeEnv({ content: [{ type: 'text', text: 'hi' }], stop_reason: 'end_turn' });
		await generateWithTools(env, { system: 'sys', messages: [{ role: 'user', content: 'q' }], tools: [] });

		expect(calls).toHaveLength(1);
		const { gatewayId, request } = calls[0];
		expect(gatewayId).toBe('driveiq');
		expect(request.provider).toBe('anthropic');
		expect(request.endpoint).toBe('v1/messages');
		expect(request.headers).toMatchObject({ 'x-api-key': 'test-key', 'cf-aig-no-wholesale': 'true' });
		expect(request.query).toMatchObject({
			model: 'claude-haiku-5-5',
			max_tokens: 16000,
			output_config: { effort: 'medium' },
		});
		expect(request.query).not.toHaveProperty('fallbacks');
	});

	it('throws on a non-2xx gateway response', async () => {
		const { env } = fakeEnv({ content: [], stop_reason: 'end_turn' }, 401);
		await expect(generateWithTools(env, { system: 's', messages: [], tools: [] })).rejects.toThrow(/AI Gateway 401/);
	});

	it('answerText skips thinking blocks and covers refusals', () => {
		expect(
			answerText({
				content: [{ type: 'thinking', text: '' }, { type: 'text', text: 'Oil change is due.' }],
				stop_reason: 'end_turn',
			})
		).toBe('Oil change is due.');
		expect(answerText({ content: [], stop_reason: 'refusal' })).toMatch(/can't help/);
		expect(answerText({ content: [], stop_reason: 'max_tokens' })).toMatch(/try again/);
	});
});
