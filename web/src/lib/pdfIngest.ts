// Client-side PDF ingestion for Aiana's document knowledge base.
//
// Runs in the browser rather than the Worker: rendering page images needs a
// real <canvas>, which a Worker doesn't have. pdfjs-dist parses the PDF here,
// then the text chunks and page images are sent to the Worker's ingest
// endpoints (embedding happens in the Worker, where Workers AI lives).
//
// pdfjs-dist is dynamically imported (not a static top-level import) so
// Vite code-splits this multi-MB dependency out of the main bundle — it's
// only loaded when a user actually opens the upload flow.

import { api } from './api';
import type { IngestChunk } from '@/types';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Renders any thrown value into text, including the JS-engine-native
 * messages (e.g. Safari's "undefined is not a function (near '...')")
 * that plain `String(err)` or `err.message` would otherwise swallow if
 * `err` isn't an Error instance. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// Page-sized chunks: most manual pages fit in one, so a spec table keeps its
// numbers next to their labels (smaller chunks split them apart).
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const BATCH = 20;
const IMAGE_RETRIES = 3;

/** Word-boundary-aware chunker with overlap between neighbouring chunks. */
export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length + 1 > chunkSize && current.length > 0) {
      chunks.push(current.join(' '));
      const overlapWords: string[] = [];
      let overlapLength = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const w = current[i];
        if (overlapLength + w.length + 1 > overlap) break;
        overlapWords.unshift(w);
        overlapLength += w.length + 1;
      }
      current = overlapWords;
      currentLength = overlapLength;
    }
    current.push(word);
    currentLength += word.length + 1;
  }
  if (current.length > 0) chunks.push(current.join(' '));
  return chunks;
}

export type UploadPhase = 'parsing' | 'indexing-text' | 'rendering-images' | 'done';

export interface UploadProgress {
  phase: UploadPhase;
  current: number;
  total: number;
}

let workerConfigured = false;

// The default `pdfjs-dist` build targets evergreen desktop engines and uses
// very recent JS (e.g. Promise.withResolvers) with no fallback — it throws
// "undefined is not a function" on any browser missing that feature. Older
// iOS/iPadOS Safari versions lag behind desktop Safari here, so PDFs picked
// on an iPhone can fail an upload that works fine on desktop. `legacy/build`
// ships the same API with polyfills for those gaps (see pdfjs-dist's own
// README: "For usage with older browsers/environments ... see the `legacy/`
// folder"), so import from there instead.
async function loadPdfJs() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!workerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.mjs',
      import.meta.url
    ).href;
    workerConfigured = true;
  }
  return pdfjsLib;
}

function canvasToPngBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('canvas.toBlob returned null'));
      blob.arrayBuffer().then(resolve, reject);
    }, 'image/png');
  });
}

async function putImageWithRetry(
  documentName: string,
  page: number,
  variant: 'thumbnail' | 'full',
  bytes: ArrayBuffer
): Promise<void> {
  for (let attempt = 1; attempt <= IMAGE_RETRIES; attempt++) {
    try {
      await api.aiana.ingestPageImage(documentName, page, variant, bytes);
      return;
    } catch (err) {
      if (attempt === IMAGE_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

/** Parses, chunks, embeds, and renders a PDF into Aiana's knowledge base.
 *
 * Two sequential phases, deliberately not interleaved per-page:
 *   1. Text: extract -> chunk -> POST to /api/search/ingest (Vectorize).
 *      No dedup server-side (fresh random point ID per chunk every run), so
 *      this is the step to fail fast and not retry blindly.
 *   2. Images: render each page to PNG -> PUT to R2 (via /api/pages/ingest).
 *      Idempotent (deterministic R2 key), safe to retry on its own.
 * If phase 1 fails, nothing in phase 2 (the slower part for a large PDF) is
 * wasted. If phase 2 fails partway, retrying only re-runs image rendering —
 * the document is already searchable via Aiana as soon as phase 1 finishes.
 *
 * documentName must be passed identically to every phase-1 and phase-2 call
 * for one upload — the two ingest endpoints only agree on the same document
 * if this string never drifts between them.
 *
 * Known v1 limitations (not solved here): no dedup on re-upload of the same
 * name, and no app-level Web Worker — the tab must stay open for the
 * duration, navigating away aborts the upload with no resume.
 */
export async function ingestPdf(
  file: File,
  documentName: string,
  onProgress: (p: UploadProgress) => void
): Promise<void> {
  let pdfDoc: PDFDocumentProxy;
  // pdfjs v6 frees the document (and its worker) via the loading task.
  let loadingTask: PDFDocumentLoadingTask | undefined;
  try {
    const pdfjsLib = await loadPdfJs();
    const data = await file.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({ data });
    pdfDoc = await loadingTask.promise;
  } catch (err) {
    await loadingTask?.destroy();
    throw new Error(`[loading] ${describeError(err)}`, { cause: err });
  }

  try {
    const pageCount = pdfDoc.numPages;

    // Phase 1: extract + chunk + index text.
    onProgress({ phase: 'parsing', current: 0, total: pageCount });
    const chunks: IngestChunk[] = [];
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ');
        if (pageText.trim()) {
          for (const content of chunkText(pageText)) {
            chunks.push({ content, chunk_index: 0, page_number: pageNum });
          }
        }
      } catch (err) {
        throw new Error(`[parsing p${pageNum}/${pageCount}] ${describeError(err)}`, { cause: err });
      }
      onProgress({ phase: 'parsing', current: pageNum, total: pageCount });
    }
    chunks.forEach((c, i) => (c.chunk_index = i));

    onProgress({ phase: 'indexing-text', current: 0, total: chunks.length });
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      try {
        await api.aiana.ingestChunks(documentName, batch);
      } catch (err) {
        throw new Error(`[indexing-text ${i}/${chunks.length}] ${describeError(err)}`, { cause: err });
      }
      onProgress({ phase: 'indexing-text', current: Math.min(i + BATCH, chunks.length), total: chunks.length });
    }

    // Phase 2: render + upload page images. Only reached if phase 1 succeeded.
    onProgress({ phase: 'rendering-images', current: 0, total: pageCount });
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });

        const fullScale = 1200 / baseViewport.width;
        const fullViewport = page.getViewport({ scale: fullScale });
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = fullViewport.width;
        fullCanvas.height = fullViewport.height;
        await page.render({ canvas: fullCanvas, viewport: fullViewport }).promise;
        const fullBytes = await canvasToPngBuffer(fullCanvas);
        await putImageWithRetry(documentName, pageNum, 'full', fullBytes);

        // Downscale the already-rendered full canvas instead of a second
        // pdf.js render call — cheap with a real <canvas> available, unlike
        // the Node scripts which re-render at each size via getScreenshot().
        const thumbScale = 300 / fullCanvas.width;
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = Math.round(fullCanvas.width * thumbScale);
        thumbCanvas.height = Math.round(fullCanvas.height * thumbScale);
        const thumbCtx = thumbCanvas.getContext('2d');
        if (!thumbCtx) throw new Error('Could not acquire 2D canvas context');
        thumbCtx.drawImage(fullCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const thumbBytes = await canvasToPngBuffer(thumbCanvas);
        await putImageWithRetry(documentName, pageNum, 'thumbnail', thumbBytes);
      } catch (err) {
        throw new Error(`[rendering-images p${pageNum}/${pageCount}] ${describeError(err)}`, { cause: err });
      }

      onProgress({ phase: 'rendering-images', current: pageNum, total: pageCount });
    }

    onProgress({ phase: 'done', current: pageCount, total: pageCount });
  } finally {
    await loadingTask.destroy();
  }
}
