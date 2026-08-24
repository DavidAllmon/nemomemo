import { describe, expect, it } from 'vitest';
import { DICTATION_MAX_PER_WINDOW } from '../routes/dictation.js';
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

  it('rate-limits a burst per IP, generously enough for real dictating', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ value: 'ek', expires_at: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const { app } = makeTestApp(
      { dictate: { key: 'sk-secret', model: 'gpt-live-transcribe' } },
      { dictationFetch: fakeFetch },
    );
    const cookie = await signup(app, 'nemo');
    const mint = () =>
      app.request('/api/v1/dictation/session', {
        method: 'POST',
        headers: { cookie, 'cf-connecting-ip': '203.0.113.7' },
      });

    // A person tapping the mic over and over never gets in the way of themselves.
    for (let i = 0; i < DICTATION_MAX_PER_WINDOW; i += 1) {
      expect((await mint()).status).toBe(200);
    }
    // A script does.
    const blocked = await mint();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    const body = (await blocked.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('RESOURCE_EXHAUSTED');
    expect(body.error.message).toMatch(/dictat/i);
  });

  it('limits per IP, so one abuser cannot mute the rest of a shared demo', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ value: 'ek', expires_at: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const { app } = makeTestApp(
      { dictate: { key: 'sk-secret', model: 'gpt-live-transcribe' } },
      { dictationFetch: fakeFetch },
    );
    // Everyone on the public demo shares one account, so the limit has to key
    // on IP — per-user would let a single abuser lock out every visitor.
    const cookie = await signup(app, 'demo');
    const mint = (ip: string) =>
      app.request('/api/v1/dictation/session', {
        method: 'POST',
        headers: { cookie, 'cf-connecting-ip': ip },
      });

    for (let i = 0; i < DICTATION_MAX_PER_WINDOW; i += 1) await mint('198.51.100.1');
    expect((await mint('198.51.100.1')).status).toBe(429);
    // …and the next visitor, same account, is unaffected.
    expect((await mint('198.51.100.2')).status).toBe(200);
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
