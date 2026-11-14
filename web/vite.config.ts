import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// The UI is built into ../dist, which the Worker serves as static assets.
export default defineConfig({
	root: here,
	plugins: [react()],
	resolve: { alias: { '@': resolve(here, 'src') } },
	build: { outDir: resolve(here, '../dist'), emptyOutDir: true },
	server: { proxy: { '/api': 'http://localhost:8787' } },
});
