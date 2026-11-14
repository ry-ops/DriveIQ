// DriveIQ Cloud — Anthropic Messages API client
// Non-streaming; mirrors social/src/core/llm.ts's callAnthropic, minus the
// Ollama fallback (no local-LLM concept in the Workers architecture).
//
// Requests go through Cloudflare AI Gateway (gateway `AI_GATEWAY_ID`) via
// the Worker's AI binding, which is pre-authenticated to the gateway, so no
// gateway token is needed. The gateway logs each call and gives
// per-request analytics in the dashboard; it forwards our own Anthropic key
// (x-api-key) upstream, and `cf-aig-no-wholesale` stops it from ever
// falling back to Cloudflare-billed credentials.

import type { Env } from '../env.js';

export interface AnthropicContentBlock {
	// 'thinking' blocks come back from current models and must be passed back
	// unchanged on the follow-up turn; 'fallback' marks a server-side
	// refusal fallback. Other types are passed through untouched.
	type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'fallback' | (string & {});
	text?: string;
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
	tool_use_id?: string;
	content?: string;
}

export interface LLMMessage {
	role: 'user' | 'assistant';
	content: string | AnthropicContentBlock[];
}

export interface AnthropicTool {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
}

export interface AnthropicResponse {
	content: AnthropicContentBlock[];
	stop_reason: string;
}

// Current models think by default and thinking counts toward max_tokens, so
// leave plenty of room; the answer itself stays short. (No server-side
// refusal fallback: Haiku doesn't support it; answerText covers refusals.)
const DEFAULT_MAX_TOKENS = 16000;

async function callAnthropic(
	env: Env,
	opts: { system: string; messages: LLMMessage[]; tools?: AnthropicTool[]; maxTokens?: number }
): Promise<AnthropicResponse> {
	const res = await env.AI.gateway(env.AI_GATEWAY_ID).run({
		provider: 'anthropic',
		endpoint: 'v1/messages',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': env.ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01',
			'cf-aig-no-wholesale': 'true',
			'cf-aig-metadata': { app: 'driveiq', feature: 'aiana' },
		} as Partial<AIGatewayHeaders>,
		query: {
			model: env.CLAUDE_MODEL,
			max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
			output_config: { effort: env.CLAUDE_EFFORT },
			system: opts.system,
			messages: opts.messages,
			...(opts.tools ? { tools: opts.tools } : {}),
		},
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`Anthropic via AI Gateway ${res.status}: ${body.slice(0, 200)}`);
	}

	return (await res.json()) as AnthropicResponse;
}

function extractText(content: AnthropicContentBlock[]): string {
	return content
		.filter((b) => b.type === 'text')
		.map((b) => b.text ?? '')
		.join('');
}

// The reply to show the owner. A refusal (or a reply cut off before any
// text) would otherwise come back as an empty answer.
function answerText(response: AnthropicResponse): string {
	const text = extractText(response.content);
	if (text.trim()) return text;
	if (response.stop_reason === 'refusal') {
		return "Sorry — I can't help with that request. Try rephrasing your question about the vehicle.";
	}
	return "Sorry — I couldn't put together an answer that time. Please try again.";
}

export async function generate(env: Env, opts: { system: string; messages: LLMMessage[]; maxTokens?: number }): Promise<string> {
	return answerText(await callAnthropic(env, opts));
}

// Tool-capable variant — returns the raw response so the caller can inspect
// stop_reason/content for tool_use blocks and drive its own execute + follow-
// up round trip (the tool's actual side effect, e.g. a DB write, belongs to
// the route calling this, not this client).
export async function generateWithTools(
	env: Env,
	opts: { system: string; messages: LLMMessage[]; tools: AnthropicTool[]; maxTokens?: number }
): Promise<AnthropicResponse> {
	return callAnthropic(env, opts);
}

export { extractText, answerText };
