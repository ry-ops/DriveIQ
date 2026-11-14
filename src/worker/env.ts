// Everything the Cloudflare runtime gives the Worker: bindings from
// wrangler.jsonc, plus the ANTHROPIC_API_KEY secret.

export interface Env {
	// D1: the vehicle, service history, reminders, Aiana's conversation.
	DB: D1Database;
	// Workers AI: embeddings for document search, and the AI Gateway route.
	AI: Ai;
	// R2: page images of uploaded documents, shown next to Aiana's answers.
	PAGE_IMAGES: R2Bucket;
	// Vectorize: the search index over uploaded documents.
	VECTORIZE: Vectorize;
	ANTHROPIC_API_KEY: string;
	CLAUDE_MODEL: string;
	CLAUDE_EFFORT: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
	AI_GATEWAY_ID: string;
	EMBEDDING_MODEL: string;

	// Set in the dashboard after turning on Cloudflare Access (docs/SETUP.md).
	ACCESS_TEAM_DOMAIN?: string;
	ACCESS_AUD?: string;
	// "true" turns the login check off. Local development only (.dev.vars).
	ALLOW_UNAUTHENTICATED?: string;
}
