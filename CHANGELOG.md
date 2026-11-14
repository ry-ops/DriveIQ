# Changelog

## 2.0.1

### Docs
- **Under the hood**: four animated diagrams in the README, each following the real code path: how a request moves through Access and the Worker, what happens when you upload a document, how Aiana answers a question, and how the What's Next forecast works. `scripts/animations.py` regenerates them.

### Dependencies
- React 19.3, TypeScript 7.0, lucide-react 1.72 and vitest 5.1 (with their type packages). No changes to how DriveIQ works or to your data.

## 2.0.0

A new DriveIQ that runs on your own Cloudflare account, installed with a **Deploy to Cloudflare** button. It's a rewrite, not an upgrade: there's no migration from v1 data.

### New
- **One Cloudflare Worker** serves the app and its API. Records in D1, page images in R2, document search in Vectorize with Workers AI embeddings.
- **Deploy to Cloudflare button**: creates the database, storage and search index in your account. The only secret is your Anthropic API key.
- **Login required**: the Worker verifies a Cloudflare Access sign-in on every API request, and stays locked until Access is set up.
- **Aiana** answers from your uploaded documents with page thumbnails, uses your service history, schedule, reminders, specs and recalls, and can create or edit reminders in conversation. One conversation shared across your devices, cleared after four idle hours. Dates follow your browser's time zone.
- **Upload documents in the app**: PDFs are read in your browser; text is indexed and every page saved as an image.
- **Editable maintenance schedule**, starting from general intervals, and **confirmed specs** that Aiana prefers over document excerpts.
- **First-run setup**: add your vehicle (VIN optional) on the first screen.
- **Recall check** against NHTSA's public recall data for your make, model and year.

### Removed
- Docker, Docker Compose and the Docker Desktop extension.
- The Python (FastAPI) backend, PostgreSQL/pgvector, Redis and the optional Qdrant store.
- Local LLMs through Docker Model Runner. Aiana uses Claude.
- CARFAX report import and the value estimate.
- The MCP server.

**v1.3.1** remains available as the last Docker release.

## 1.3.1 and earlier

See the [v1.3.1 release notes](https://github.com/ry-ops/DriveIQ/releases/tag/v1.3.1).
