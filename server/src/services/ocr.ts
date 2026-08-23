import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/index.js';

export interface OcrEngine {
  /** Return the recognized text for an image file (empty string for none). */
  recognize(absolutePath: string): Promise<string>;
}

// One OCR job at a time across the WHOLE process — WASM workers are memory-
// hungry, and in cloud mode one process serves every reef. Module-level so
// every OcrQueue (one per tenant app) shares the same lane.
let chain: Promise<void> = Promise.resolve();

export class OcrQueue {
  constructor(
    private db: Db,
    private uploadsDir: string,
    private engine: OcrEngine,
  ) {}

  /** Fire-and-forget: never blocks or fails the upload that queued it. */
  enqueue(attachmentId: number): void {
    chain = chain.then(async () => {
      try {
        const row = this.db.$client
          .prepare('SELECT storage_path FROM attachment WHERE id = ?')
          .get(attachmentId) as { storage_path: string } | undefined;
        if (!row) return; // deleted before its turn came up
        const absolute = path.resolve(this.uploadsDir, row.storage_path);
        if (!absolute.startsWith(path.resolve(this.uploadsDir))) return;
        const text = (await this.engine.recognize(absolute)).trim();
        if (text) {
          // Raw UPDATE so the attachment_fts trigger fires.
          this.db.$client
            .prepare('UPDATE attachment SET extracted_text = ? WHERE id = ?')
            .run(text, attachmentId);
        }
      } catch (error) {
        console.warn(`[ocr] attachment ${attachmentId} failed:`, error);
      }
    });
  }

  /** Resolves once everything enqueued so far has finished (tests). */
  idle(): Promise<void> {
    return chain;
  }
}

// The tesseract worker is shared process-wide and created lazily on the first
// job — boot stays fast, and instances that never see an image never pay.
let sharedEngine: OcrEngine | null = null;

export function tesseractEngine(langs: string[], cachePath: string): OcrEngine {
  if (sharedEngine) return sharedEngine;
  let workerPromise: Promise<import('tesseract.js').Worker> | null = null;
  const getWorker = () => {
    workerPromise ??= (async () => {
      fs.mkdirSync(cachePath, { recursive: true });
      const { createWorker } = await import('tesseract.js');
      // Traineddata downloads once into cachePath (the data dir) and is
      // reused — the Docker image ships no language files.
      return createWorker(langs, 1, { cachePath });
    })();
    return workerPromise;
  };
  sharedEngine = {
    async recognize(absolutePath: string) {
      const worker = await getWorker();
      const result = await worker.recognize(absolutePath);
      return result.data.text ?? '';
    },
  };
  return sharedEngine;
}
