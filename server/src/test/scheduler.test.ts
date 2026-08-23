import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { inboxes, memos, users } from '../db/schema.js';
import { runSchedulerTick } from '../services/scheduler.js';
import { createMemo, jsonRequest, makeTestApp, signup } from './helpers.js';

const now = () => Math.floor(Date.now() / 1000);
const fakeMailer = (box: { to: string; subject: string; text: string }[]) => ({
  send: async (m: { to: string; subject: string; text: string }) => {
    box.push(m);
  },
});

describe('scheduler tick', () => {
  it('surfaces a due bottle: clears surface_at, BOTTLE_ARRIVED inbox item, memo appears in feed', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'from the past', surfaceAt: now() + 3600 });
    db.update(memos).set({ surfaceAt: now() - 10 }).where(eq(memos.uid, memo.uid)).run();
    const result = runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null });
    expect(result.surfaced).toBe(1);
    const row = db.select().from(memos).where(eq(memos.uid, memo.uid)).get()!;
    expect(row.surfaceAt).toBeNull();
    const items = db.select().from(inboxes).all();
    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe('BOTTLE_ARRIVED');
    const home = (await (
      await jsonRequest(app, 'GET', '/api/v1/memos?scope=home', undefined, cookie)
    ).json()) as { memos: { uid: string }[] };
    expect(home.memos).toHaveLength(1);
    // second tick is a no-op
    expect(runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null }).surfaced).toBe(0);
  });

  it('fires a due one-shot reminder: REMINDER inbox item + email, remind_at cleared', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'water the plants #chores' });
    db.update(memos).set({ remindAt: now() - 10 }).where(eq(memos.uid, memo.uid)).run();
    const box: { to: string; subject: string; text: string }[] = [];
    const result = runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: fakeMailer(box) });
    expect(result.reminded).toBe(1);
    expect(db.select().from(memos).where(eq(memos.uid, memo.uid)).get()!.remindAt).toBeNull();
    expect(db.select().from(inboxes).all()[0]!.type).toBe('REMINDER');
    await new Promise((resolve) => setTimeout(resolve, 10)); // trySend is fire-and-forget
    expect(box).toHaveLength(1);
    expect(box[0]!.to).toBe('nemo@test.reef');
    expect(box[0]!.text).toContain('water the plants');
  });

  it('a recurring reminder advances instead of clearing (catch-up past downtime)', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'nemo');
    const memo = await createMemo(app, cookie, { content: 'standup' });
    const due = now() - 3 * 86_400; // three days missed
    db.update(memos).set({ remindAt: due, remindEvery: 'DAILY' }).where(eq(memos.uid, memo.uid)).run();
    runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null });
    const row = db.select().from(memos).where(eq(memos.uid, memo.uid)).get()!;
    expect(row.remindEvery).toBe('DAILY');
    expect(row.remindAt).toBeGreaterThan(now()); // advanced past now, not spammed per missed day
    expect(db.select().from(inboxes).all()).toHaveLength(1); // exactly one nudge
  });

  it('warns once when Dory is about to forget (≤1h left)', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'dory');
    const memo = await createMemo(app, cookie, { content: 'fading', dory: true });
    db.update(memos).set({ forgetAt: now() + 1800 }).where(eq(memos.uid, memo.uid)).run();
    expect(runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null }).warned).toBe(1);
    expect(runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null }).warned).toBe(0);
    expect(db.select().from(inboxes).all().filter((i) => i.type === 'DORY_WARNING')).toHaveLength(1);
  });

  it('sweeping bumps the per-user forgotten counter and skips reminders on expired memos', async () => {
    const { app, db, config } = makeTestApp();
    const cookie = await signup(app, 'dory');
    const memo = await createMemo(app, cookie, { content: 'gone', dory: true });
    db.update(memos)
      .set({ forgetAt: now() - 10, remindAt: now() - 10 })
      .where(eq(memos.uid, memo.uid))
      .run();
    const result = runSchedulerTick(db, { uploadsDir: config.uploadsDir, mailer: null });
    expect(result.forgotten).toBe(1);
    expect(result.reminded).toBe(0);
    expect(db.select().from(users).all()[0]!.doryForgottenCount).toBe(1);
    expect(db.select().from(memos).all()).toHaveLength(0);
  });
});
