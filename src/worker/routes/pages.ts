// Page images for uploaded documents, shown as thumbnails next to Aiana's
// answers. The browser renders each PDF page when the document is uploaded
// (web/src/lib/pdfIngest.ts) and stores it in R2, keyed by a sanitized
// document name + page number.

import { Hono } from 'hono';
import type { Env } from '../env.js';

export const pagesRoutes = new Hono<{ Bindings: Env }>();

export function sanitizeDocumentName(name: string): string {
	return name.replace(/[^\w-]/g, '_').slice(0, 100);
}

async function loadImage(env: Env, key: string): Promise<Response | null> {
	const object = await env.PAGE_IMAGES.get(key);
	if (!object) return null;
	return new Response(object.body, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=86400',
		},
	});
}

pagesRoutes.get('/:document/:page/thumbnail', async (c) => {
	const doc = sanitizeDocumentName(c.req.param('document'));
	const page = c.req.param('page');
	const res = await loadImage(c.env, `${doc}/page-${page}/thumbnail.png`);
	return res ?? c.json({ detail: `Image not found: ${doc} page ${page}` }, 404);
});

pagesRoutes.get('/:document/:page/full', async (c) => {
	const doc = sanitizeDocumentName(c.req.param('document'));
	const page = c.req.param('page');
	const res = await loadImage(c.env, `${doc}/page-${page}/full.png`);
	return res ?? c.json({ detail: `Image not found: ${doc} page ${page}` }, 404);
});

// Upload endpoint for page images (web/src/lib/pdfIngest.ts). Raw image bytes
// in the request body, keyed by the same convention as the GET routes above.
pagesRoutes.put('/ingest/:document/:page/:variant{thumbnail|full}', async (c) => {
	const doc = sanitizeDocumentName(c.req.param('document'));
	const page = c.req.param('page');
	const variant = c.req.param('variant');
	const body = await c.req.arrayBuffer();
	if (body.byteLength === 0) return c.json({ detail: 'Empty body' }, 400);

	await c.env.PAGE_IMAGES.put(`${doc}/page-${page}/${variant}.png`, body, {
		httpMetadata: { contentType: 'image/png' },
	});
	return c.json({ stored: `${doc}/page-${page}/${variant}.png`, bytes: body.byteLength });
});
