import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { memos, users, type UserRow } from '../db/schema.js';
import { buildMarkdownExport } from '../services/export-service.js';
import { createMemo, jsonRequest, makeTestApp, signup, type TestContext } from './helpers.js';

function userRow(ctx: TestContext, username: string): UserRow {
  const row = ctx.db.select().from(users).where(eq(users.username, username)).get();
  if (!row) throw new Error(`no such user: ${username}`);
  return row;
}

describe('markdown export service', () => {
  it("exports only the caller's memos as dated markdown files with frontmatter", async () => {
    const ctx = makeTestApp();
    const finnCookie = await signup(ctx.app, 'finn');
    const gillCookie = await signup(ctx.app, 'gill');
    const memo = await createMemo(ctx.app, finnCookie, {
      content: 'Snorkel log #reef/notes today',
      visibility: 'PUBLIC',
    });
    await createMemo(ctx.app, gillCookie, { content: 'not yours' });

    const result = buildMarkdownExport(ctx.db, ctx.config, userRow(ctx, 'finn'));

    expect(result.documents).toHaveLength(1);
    const doc = result.documents[0]!;
    expect(doc.path).toMatch(new RegExp(`^memos/\\d{4}-\\d{2}-\\d{2}-${memo.uid}\\.md$`));
    expect(doc.markdown).toContain('---\n');
    expect(doc.markdown).toContain('visibility: PUBLIC');
    expect(doc.markdown).toContain('created: ');
    expect(doc.markdown).toContain('- "reef/notes"');
    expect(doc.markdown).toContain('Snorkel log #reef/notes today');
  });

  it('excludes expired dory memos but keeps live ones with a forgets stamp', async () => {
    const ctx = makeTestApp();
    const cookie = await signup(ctx.app, 'finn');
    const expired = await createMemo(ctx.app, cookie, { content: 'already forgotten', dory: true });
    const live = await createMemo(ctx.app, cookie, { content: 'still remembered', dory: true });
    ctx.db
      .update(memos)
      .set({ forgetAt: Math.floor(Date.now() / 1000) - 10 })
      .where(eq(memos.uid, expired.uid))
      .run();

    const result = buildMarkdownExport(ctx.db, ctx.config, userRow(ctx, 'finn'));

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]!.path).toContain(live.uid);
    expect(result.documents[0]!.markdown).toContain('forgets: ');
  });

  it('exports comments under comments/ pointing at the parent memo', async () => {
    const ctx = makeTestApp();
    const cookie = await signup(ctx.app, 'finn');
    const parent = await createMemo(ctx.app, cookie, { content: 'the parent memo' });
    const commentResponse = await jsonRequest(
      ctx.app,
      'POST',
      `/api/v1/memos/${parent.uid}/comments`,
      { content: 'a barnacle of a thought' },
      cookie,
    );
    expect(commentResponse.status).toBe(201);

    const result = buildMarkdownExport(ctx.db, ctx.config, userRow(ctx, 'finn'));

    expect(result.documents).toHaveLength(2);
    const comment = result.documents.find((d) => d.path.startsWith('comments/'));
    expect(comment).toBeDefined();
    expect(comment!.markdown).toContain(`comment_on: ${parent.uid}`);
    expect(comment!.markdown).toContain('a barnacle of a thought');
    expect(result.documents.filter((d) => d.path.startsWith('memos/'))).toHaveLength(1);
  });

  it('includes archived memos with an archived flag', async () => {
    const ctx = makeTestApp();
    const cookie = await signup(ctx.app, 'finn');
    const memo = await createMemo(ctx.app, cookie, { content: 'old shell' });
    const patch = await jsonRequest(
      ctx.app,
      'PATCH',
      `/api/v1/memos/${memo.uid}`,
      { rowStatus: 'ARCHIVED' },
      cookie,
    );
    expect(patch.status).toBe(200);

    const result = buildMarkdownExport(ctx.db, ctx.config, userRow(ctx, 'finn'));

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]!.markdown).toContain('archived: true');
  });

  it('carries attachments along and rewrites inline file links to relative paths', async () => {
    const ctx = makeTestApp();
    const cookie = await signup(ctx.app, 'finn');
    const form = new FormData();
    form.append('file', new File(['treasure map'], 'map.txt', { type: 'text/plain' }));
    const upload = await ctx.app.request('/api/v1/attachments', {
      method: 'POST',
      headers: { cookie },
      body: form,
    });
    expect(upload.status).toBe(201);
    const attachment = ((await upload.json()) as { attachment: { uid: string } }).attachment;

    await createMemo(ctx.app, cookie, {
      content: `Here is the [map](/file/attachments/${attachment.uid}/map.txt)`,
      attachmentUids: [attachment.uid],
    });

    const result = buildMarkdownExport(ctx.db, ctx.config, userRow(ctx, 'finn'));

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.path).toBe(`attachments/${attachment.uid}/map.txt`);
    expect(fs.readFileSync(result.files[0]!.absolutePath, 'utf8')).toBe('treasure map');
    const doc = result.documents[0]!;
    expect(doc.markdown).toContain(`[map](attachments/${attachment.uid}/map.txt)`);
    expect(doc.markdown).not.toContain('/file/attachments/');
    expect(doc.markdown).toContain(`- "attachments/${attachment.uid}/map.txt"`);
  });
});

describe('GET /api/v1/memos/:uid/markdown (single memo)', () => {
  it('downloads one memo as a frontmattered .md file, ACL-gated like reading it', async () => {
    const ctx = makeTestApp();
    const finnCookie = await signup(ctx.app, 'finn');
    const gillCookie = await signup(ctx.app, 'gill');
    const memo = await createMemo(ctx.app, finnCookie, {
      content: 'Current #reef status: thriving',
      visibility: 'PRIVATE',
    });

    const response = await jsonRequest(ctx.app, 'GET', `/api/v1/memos/${memo.uid}/markdown`, undefined, finnCookie);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(response.headers.get('content-disposition')).toMatch(
      new RegExp(`attachment; filename="\\d{4}-\\d{2}-\\d{2}-${memo.uid}\\.md"`),
    );
    const markdown = await response.text();
    expect(markdown).toContain('---\n');
    expect(markdown).toContain('visibility: PRIVATE');
    expect(markdown).toContain('- "reef"');
    expect(markdown).toContain('Current #reef status: thriving');

    // Someone else's PRIVATE memo swims away, exactly like reading it.
    const denied = await jsonRequest(ctx.app, 'GET', `/api/v1/memos/${memo.uid}/markdown`, undefined, gillCookie);
    expect(denied.status).toBe(404);
  });
});

describe('GET /api/v1/memos/export/markdown', () => {
  it('signed-in members get a zip of their memos; anonymous visitors are refused', async () => {
    const ctx = makeTestApp();
    const cookie = await signup(ctx.app, 'finn');
    const memo = await createMemo(ctx.app, cookie, { content: 'zip me up' });

    const response = await jsonRequest(ctx.app, 'GET', '/api/v1/memos/export/markdown', undefined, cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('content-disposition')).toContain('nemomemo-memos-finn-');

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    // Entry names sit uncompressed in the zip's local file headers.
    expect(bytes.toString('latin1')).toContain(`-${memo.uid}.md`);

    const anonymous = await jsonRequest(ctx.app, 'GET', '/api/v1/memos/export/markdown');
    expect(anonymous.status).toBe(401);
  });
});
