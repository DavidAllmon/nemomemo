import { describe, expect, it } from 'vitest';
import type { MemoDto } from '@nemomemo/shared';
import { handleTelegramMessage, type TelegramMessage } from '../services/telegram.js';
import { jsonRequest, makeTestApp, signup } from './helpers.js';

type Ctx = ReturnType<typeof makeTestApp>;

const now = () => Math.floor(Date.now() / 1000);

/** A test app with the bot configured, plus a fake Telegram file endpoint. */
function botApp(options: Parameters<typeof makeTestApp>[1] = {}): Ctx {
  return makeTestApp({ telegram: { botToken: 'test-bot-token' } }, options);
}

function message(chatId: string, fields: Partial<TelegramMessage> = {}): TelegramMessage {
  return { message_id: 1, chat: { id: Number(chatId) }, date: now(), ...fields };
}

/** Stands in for api.telegram.org: getFile then the file download. */
function fakeTelegramFetch(bytes: Buffer, filePath = 'photos/file_1.jpg'): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input);
    if (url.includes('/getFile')) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: filePath } }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/file/bot')) return new Response(bytes);
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

async function mintCode(app: Ctx['app'], cookie: string): Promise<string> {
  const response = await jsonRequest(app, 'POST', '/api/v1/users/-/telegram/link-code', {}, cookie);
  expect(response.status).toBe(201);
  return ((await response.json()) as { code: string }).code;
}

async function feed(app: Ctx['app'], cookie: string): Promise<MemoDto[]> {
  const response = await jsonRequest(app, 'GET', '/api/v1/memos?scope=home', undefined, cookie);
  return ((await response.json()) as { memos: MemoDto[] }).memos;
}

describe('telegram bot — linking a chat', () => {
  it('greets an unlinked chat and tells it how to link', async () => {
    const ctx = botApp();
    const reply = await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: '/start' }));
    expect(reply).toMatch(/link/i);
    expect(await feed(ctx.app, await signup(ctx.app, 'marlin'))).toHaveLength(0);
  });

  it('links a chat with a valid code, then saves what it is sent', async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    const code = await mintCode(ctx.app, cookie);

    const linked = await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${code}` }));
    expect(linked).toMatch(/marlin/);

    const saved = await handleTelegramMessage(
      ctx.db,
      ctx.config,
      {},
      message('42', { text: 'sourdough starter from the market #recipes' }),
    );
    expect(saved).toMatch(/saved/i);

    const memos = await feed(ctx.app, cookie);
    expect(memos).toHaveLength(1);
    expect(memos[0]!.content).toBe('sourdough starter from the market #recipes');
    expect(memos[0]!.tags).toEqual(['recipes']);
  });

  it('refuses an unknown code and leaves the chat unlinked', async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    const reply = await handleTelegramMessage(
      ctx.db,
      ctx.config,
      {},
      message('42', { text: '/link nonsense' }),
    );
    expect(reply).toMatch(/didn't work|expired|check/i);
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: 'should not save' }));
    expect(await feed(ctx.app, cookie)).toHaveLength(0);
  });

  it('burns the code after one use', async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    const code = await mintCode(ctx.app, cookie);
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${code}` }));
    // A second chat can't reuse the same code.
    const reused = await handleTelegramMessage(
      ctx.db,
      ctx.config,
      {},
      message('99', { text: `/link ${code}` }),
    );
    expect(reused).toMatch(/didn't work|expired|check/i);
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('99', { text: 'from the wrong chat' }));
    expect(await feed(ctx.app, cookie)).toHaveLength(0);
  });

  it('refuses an expired code', async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    const code = await mintCode(ctx.app, cookie);
    ctx.db.$client.prepare('UPDATE telegram_link_code SET expires_ts = ?').run(now() - 10);
    const reply = await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${code}` }));
    expect(reply).toMatch(/didn't work|expired|check/i);
  });

  it('unlinks on request, and then saves nothing', async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    const code = await mintCode(ctx.app, cookie);
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${code}` }));
    const bye = await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: '/unlink' }));
    expect(bye).toMatch(/disconnected|unlinked/i);
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: 'after unlink' }));
    expect(await feed(ctx.app, cookie)).toHaveLength(0);
  });

  it('moves a chat when it is linked to a second member', async () => {
    const ctx = botApp();
    const marlin = await signup(ctx.app, 'marlin');
    const dory = await signup(ctx.app, 'dory');
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${await mintCode(ctx.app, marlin)}` }));
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${await mintCode(ctx.app, dory)}` }));
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: 'belongs to dory now' }));

    expect(await feed(ctx.app, marlin)).toHaveLength(0);
    expect((await feed(ctx.app, dory))[0]!.content).toBe('belongs to dory now');
    const rows = ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM telegram_chat').get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it("goes quiet for an archived member's chat", async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${await mintCode(ctx.app, cookie)}` }));
    ctx.db.$client.prepare("UPDATE user SET row_status = 'ARCHIVED' WHERE username = 'marlin'").run();
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: 'nobody home' }));
    const count = ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM memo').get() as { n: number };
    expect(count.n).toBe(0);
  });
});

describe('telegram bot — what it saves', () => {
  it('uses the member\'s default visibility', async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    await jsonRequest(ctx.app, 'PATCH', '/api/v1/users/-/settings', { general: { defaultVisibility: 'PUBLIC' } }, cookie);
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${await mintCode(ctx.app, cookie)}` }));
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: 'shout it out' }));
    expect((await feed(ctx.app, cookie))[0]!.visibility).toBe('PUBLIC');
  });

  it('saves a photo as an attachment with its caption, and queues OCR', async () => {
    const enqueued: number[] = [];
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${await mintCode(ctx.app, cookie)}` }));

    const fakeOcr = { enqueue: (id: number) => enqueued.push(id) };
    const reply = await handleTelegramMessage(
      ctx.db,
      ctx.config,
      { fetchImpl: fakeTelegramFetch(Buffer.from('fake-jpeg-bytes')), ocr: fakeOcr },
      message('42', {
        caption: 'the whiteboard #work',
        photo: [{ file_id: 'small', file_size: 10 }, { file_id: 'large', file_size: 900 }],
      }),
    );
    expect(reply).toMatch(/saved/i);

    const memos = await feed(ctx.app, cookie);
    expect(memos[0]!.content).toBe('the whiteboard #work');
    expect(memos[0]!.attachments).toHaveLength(1);
    expect(enqueued).toHaveLength(1);
  });

  it('saves a voice note as audio and queues transcription', async () => {
    const transcribed: number[] = [];
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${await mintCode(ctx.app, cookie)}` }));

    await handleTelegramMessage(
      ctx.db,
      ctx.config,
      {
        fetchImpl: fakeTelegramFetch(Buffer.from('fake-ogg'), 'voice/file_2.oga'),
        transcribe: { enqueue: (id: number) => transcribed.push(id) },
      },
      message('42', { voice: { file_id: 'voice1', mime_type: 'audio/ogg', file_size: 400 } }),
    );

    const memos = await feed(ctx.app, cookie);
    expect(memos[0]!.attachments).toHaveLength(1);
    expect(memos[0]!.attachments[0]!.type).toBe('audio/ogg');
    expect(transcribed).toHaveLength(1);
  });

  it('ignores an empty message rather than saving a blank memo', async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${await mintCode(ctx.app, cookie)}` }));
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: '   ' }));
    expect(await feed(ctx.app, cookie)).toHaveLength(0);
  });
});

describe('telegram bot — the link routes', () => {
  it('reports enabled + unlinked, then linked', async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    const before = await jsonRequest(ctx.app, 'GET', '/api/v1/users/-/telegram', undefined, cookie);
    expect(await before.json()).toMatchObject({ enabled: true, linked: false });

    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${await mintCode(ctx.app, cookie)}` }));
    const after = await jsonRequest(ctx.app, 'GET', '/api/v1/users/-/telegram', undefined, cookie);
    expect(await after.json()).toMatchObject({ enabled: true, linked: true });
  });

  it('unlinks from the web side too', async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: `/link ${await mintCode(ctx.app, cookie)}` }));
    expect((await jsonRequest(ctx.app, 'DELETE', '/api/v1/users/-/telegram', undefined, cookie)).status).toBe(200);
    await handleTelegramMessage(ctx.db, ctx.config, {}, message('42', { text: 'orphaned' }));
    expect(await feed(ctx.app, cookie)).toHaveLength(0);
  });

  it('says the instance has no bot when the token is unset', async () => {
    const ctx = makeTestApp(); // no telegram config
    const cookie = await signup(ctx.app, 'marlin');
    const status = await jsonRequest(ctx.app, 'GET', '/api/v1/users/-/telegram', undefined, cookie);
    expect(await status.json()).toMatchObject({ enabled: false, linked: false });
    expect((await jsonRequest(ctx.app, 'POST', '/api/v1/users/-/telegram/link-code', {}, cookie)).status).toBe(400);
  });

  it('needs a session — an access token cannot link a chat', async () => {
    const ctx = botApp();
    const cookie = await signup(ctx.app, 'marlin');
    const minted = await jsonRequest(ctx.app, 'POST', '/api/v1/tokens', { name: 'cli' }, cookie);
    const { plaintext } = (await minted.json()) as { plaintext: string };
    const response = await ctx.app.request('/api/v1/users/-/telegram/link-code', {
      method: 'POST',
      headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });
});
