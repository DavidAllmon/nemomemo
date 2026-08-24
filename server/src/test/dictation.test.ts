import { describe, expect, it } from 'vitest';
import { jsonRequest, makeTestApp, signup } from './helpers.js';

describe('live dictation session minting', () => {
  it('mints an ephemeral OpenAI key for a transcription session', async () => {
    const seen: { url?: string; auth?: string | null; body?: Record<string, unknown> } = {};
    const fakeFetch: typeof fetch = async (input, init) => {
      seen.url = String(input);
      seen.auth = new Headers(init?.headers).get('authorization');
      seen.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ value: 'ek_test_123', expires_at: 1787500000 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const { app } = makeTestApp(
      { dictate: { key: 'sk-secret', model: 'gpt-live-transcribe' } },
      { dictationFetch: fakeFetch },
    );
    const cookie = await signup(app, 'nemo');
    const response = await jsonRequest(app, 'POST', '/api/v1/dictation/session', undefined, cookie);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { clientSecret: string; expiresAt: number };
    expect(json.clientSecret).toBe('ek_test_123');
    expect(json.expiresAt).toBe(1787500000);

    expect(seen.url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    expect(seen.auth).toBe('Bearer sk-secret');
    const session = seen.body!.session as {
      type: string;
      audio: { input: { transcription: { model: string }; turn_detection: unknown } };
    };
    expect(session.type).toBe('transcription');
    expect(session.audio.input.transcription.model).toBe('gpt-live-transcribe');
    expect(session.audio.input.turn_detection).toBeNull();
  });

  it('answers 404 when dictation is not configured (test default)', async () => {
    const { app } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const response = await jsonRequest(app, 'POST', '/api/v1/dictation/session', undefined, cookie);
    expect(response.status).toBe(404);
  });

  it('requires a signed-in member', async () => {
    const { app } = makeTestApp({ dictate: { key: 'sk-secret', model: 'gpt-live-transcribe' } });
    const response = await jsonRequest(app, 'POST', '/api/v1/dictation/session');
    expect(response.status).toBe(401);
  });

  it('surfaces upstream failure without leaking the key', async () => {
    const fakeFetch: typeof fetch = async () => new Response('denied', { status: 401 });
    const { app } = makeTestApp(
      { dictate: { key: 'sk-secret', model: 'gpt-live-transcribe' } },
      { dictationFetch: fakeFetch },
    );
    const cookie = await signup(app, 'nemo');
    const response = await jsonRequest(app, 'POST', '/api/v1/dictation/session', undefined, cookie);
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain('sk-secret');
  });
});
