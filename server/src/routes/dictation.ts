import { Hono } from 'hono';
import type { Config } from '../config.js';
import { apiError } from '../lib/errors.js';
import { requireViewer, type AppEnv } from '../middleware/auth.js';

/**
 * Live dictation: mint a short-lived OpenAI Realtime ephemeral key so the
 * browser can open a WebRTC transcription session directly. The real API key
 * never leaves the server; the ephemeral key expires in minutes and can only
 * run the transcription session configured here.
 */
export function dictationRoutes(config: Config, fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post('/session', async (c) => {
    requireViewer(c);
    const dictate = config.dictate;
    if (!dictate) {
      throw apiError('NOT_FOUND', 'Live dictation is not set up on this reef');
    }
    const response = await fetchImpl('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${dictate.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session: {
          type: 'transcription',
          audio: {
            input: {
              transcription: { model: dictate.model },
              // gpt-live-transcribe segments speech itself; VAD is rejected.
              turn_detection: null,
            },
          },
        },
      }),
    });
    if (!response.ok) {
      console.warn(`[dictation] client_secrets answered ${response.status}`);
      throw apiError(
        'UPSTREAM',
        "The transcription service didn't answer — try again in a moment, or just keep typing. 🐟",
      );
    }
    const json = (await response.json()) as { value: string; expires_at: number };
    return c.json({ clientSecret: json.value, expiresAt: json.expires_at });
  });

  return app;
}
