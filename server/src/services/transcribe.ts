import fs from 'node:fs';
import path from 'node:path';
import type { OcrEngine } from './ocr.js';

/**
 * Voice transcription engine: POSTs the audio file to any OpenAI-compatible
 * /audio/transcriptions endpoint (OpenAI itself, a local whisper.cpp server,
 * LocalAI, …). Plugs into the same serialized queue and extracted_text →
 * attachment_fts pipeline as OCR. Non-2xx throws; the queue catches + warns.
 */
export function transcribeEngine(
  url: string,
  key: string | null,
  model: string,
  fetchImpl: typeof fetch = fetch,
): OcrEngine {
  return {
    async recognize(absolutePath: string): Promise<string> {
      const bytes = fs.readFileSync(absolutePath);
      const form = new FormData();
      form.append('file', new File([bytes], path.basename(absolutePath)));
      form.append('model', model);
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: key ? { authorization: `Bearer ${key}` } : {},
        body: form,
      });
      if (!response.ok) {
        throw new Error(`transcription endpoint answered ${response.status}`);
      }
      const json = (await response.json()) as { text?: string };
      return json.text ?? '';
    },
  };
}
