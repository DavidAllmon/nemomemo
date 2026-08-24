import { Hono } from 'hono';
import type { Config } from '../config.js';
import { apiError } from '../lib/errors.js';
import { requireViewer, type AppEnv } from '../middleware/auth.js';
import { makeRateLimiter } from '../middleware/rate-limit.js';

/**
 * Live dictation: mint a short-lived OpenAI Realtime ephemeral key so the
 * browser can open a WebRTC transcription session directly. The real API key
 * never leaves the server; the ephemeral key expires in minutes and can only
 * run the transcription session configured here.
 *
 * Minting costs money downstream, and a reef open to the public (the demo signs
 * everyone into one shared account) would otherwise let a script mint without
 * limit. The cap is per IP, not per member — per member, one abuser on the demo
 * would mute every other visitor. It is set well above what a person tapping the
 * mic can reach: 20 in 10 minutes is one dictation every 30 seconds, sustained.
 *
 * This bounds *minting*, not spend: the browser streams audio to OpenAI
 * directly, so a budget on the OpenAI project is still the real backstop.
 */
/** Sessions one IP may mint per DICTATION_WINDOW_MS. Exported for the tests. */
export const DICTATION_MAX_PER_WINDOW = 20;
const DICTATION_WINDOW_MS = 10 * 60_000;

export function dictationRoutes(config: Config, fetchImpl: typeof fetch = fetch): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const limiter = makeRateLimiter({
    scope: 'dictation',
    windowMs: DICTATION_WINDOW_MS,
    max: DICTATION_MAX_PER_WINDOW,
    message: "That's a lot of dictating — take a breath and try again in a few minutes. 🐟",
  });

  app.post('/session', limiter, async (c) => {
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
