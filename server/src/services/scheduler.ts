import type { Db } from '../db/index.js';
import { nowSeconds } from '../lib/time.js';
import { sweepDoryMemos } from './dory-sweeper.js';
import { sweepTrash } from './trash-sweeper.js';
import { reminderMessage, trySend, type Mailer } from './email.js';
import { snippet } from './memo-service.js';
import { getInstanceGeneral } from './settings.js';

/**
 * The reef's one clock: a minute tick that surfaces bottles, fires reminders,
 * warns about imminent Dory expiries, runs the Dory sweep, and empties the
 * expired end of the trash. New time-based work belongs in this tick — not in
 * another interval.
 */
export interface SchedulerDeps {
  uploadsDir: string;
  mailer: Mailer | null;
}

export interface SchedulerTickResult {
  surfaced: number;
  reminded: number;
  warned: number;
  forgotten: number;
  purged: number;
}

/** How long before expiry the "Dory is about to forget…" notice fires. */
const DORY_WARNING_SECONDS = 3600;

export function advanceReminder(due: number, every: 'DAILY' | 'WEEKLY' | 'MONTHLY'): number {
  if (every === 'DAILY') return due + 86_400;
  if (every === 'WEEKLY') return due + 7 * 86_400;
  // MONTHLY: calendar month in UTC. JS date overflow (Jan 31 → Mar 3) is
  // accepted — the nudge still lands about a month later.
  const date = new Date(due * 1000);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return Math.floor(date.getTime() / 1000);
}

export function runSchedulerTick(db: Db, deps: SchedulerDeps, now = nowSeconds()): SchedulerTickResult {
  const sqlite = db.$client;

  // 1) Bottles wash ashore: clear surface_at and announce the arrival.
  const surfaceBottles = sqlite.transaction(() => {
    const due = sqlite
      .prepare(
        'SELECT id, creator_id FROM memo WHERE surface_at IS NOT NULL AND surface_at <= ? AND deleted_at IS NULL',
      )
      .all(now) as { id: number; creator_id: number }[];
    const clear = sqlite.prepare('UPDATE memo SET surface_at = NULL WHERE id = ?');
    const notify = sqlite.prepare(
      "INSERT INTO inbox (sender_id, receiver_id, type, memo_id) VALUES (?, ?, 'BOTTLE_ARRIVED', ?)",
    );
    for (const row of due) {
      clear.run(row.id);
      notify.run(row.creator_id, row.creator_id, row.id);
    }
    return due.length;
  });
  const surfaced = surfaceBottles();

  // 2) Reminders: nudge, then advance (recurring) or clear (one-shot).
  //    Expired-but-unswept Dory memos never nudge — they're already gone.
  interface DueReminder {
    id: number;
    creator_id: number;
    remind_at: number;
    remind_every: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
    content: string;
    username: string;
    email: string;
  }
  const fireReminders = sqlite.transaction(() => {
    const due = sqlite
      .prepare(
        `SELECT memo.id, memo.creator_id, memo.remind_at, memo.remind_every, memo.content,
                user.username, user.email
         FROM memo JOIN user ON user.id = memo.creator_id
         WHERE memo.remind_at IS NOT NULL AND memo.remind_at <= ?
           AND (memo.forget_at IS NULL OR memo.forget_at > ?)
           AND memo.deleted_at IS NULL`,
      )
      .all(now, now) as DueReminder[];
    const reschedule = sqlite.prepare('UPDATE memo SET remind_at = ? WHERE id = ?');
    const clear = sqlite.prepare('UPDATE memo SET remind_at = NULL, remind_every = NULL WHERE id = ?');
    const notify = sqlite.prepare(
      "INSERT INTO inbox (sender_id, receiver_id, type, memo_id) VALUES (?, ?, 'REMINDER', ?)",
    );
    for (const row of due) {
      notify.run(row.creator_id, row.creator_id, row.id);
      if (row.remind_every) {
        // Catch up past downtime with a single nudge, not one per missed slot.
        let next = advanceReminder(row.remind_at, row.remind_every);
        while (next <= now) next = advanceReminder(next, row.remind_every);
        reschedule.run(next, row.id);
      } else {
        clear.run(row.id);
      }
    }
    return due;
  });
  const reminders = fireReminders();
  if (deps.mailer && reminders.length > 0) {
    const instanceName = getInstanceGeneral(db).name;
    for (const row of reminders) {
      if (!row.email) continue;
      trySend(deps.mailer, { to: row.email, ...reminderMessage(instanceName, row.username, snippet(row.content)) });
    }
  }

  // 3) "Dory is about to forget…": one warning per memo in its final hour.
  const warnExpiring = sqlite.transaction(() => {
    const soon = sqlite
      .prepare(
        `SELECT id, creator_id FROM memo
         WHERE forget_at IS NOT NULL AND forget_at > ? AND forget_at <= ?
           AND row_status = 'NORMAL' AND deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM inbox WHERE inbox.type = 'DORY_WARNING' AND inbox.memo_id = memo.id
           )`,
      )
      .all(now, now + DORY_WARNING_SECONDS) as { id: number; creator_id: number }[];
    const notify = sqlite.prepare(
      "INSERT INTO inbox (sender_id, receiver_id, type, memo_id) VALUES (?, ?, 'DORY_WARNING', ?)",
    );
    for (const row of soon) notify.run(row.creator_id, row.creator_id, row.id);
    return soon.length;
  });
  const warned = warnExpiring();

  // 4) The Dory sweep itself (also bumps per-user forgotten counters).
  const forgotten = sweepDoryMemos(db, deps.uploadsDir);

  // 5) The trash: anything that has outstayed its week is really gone now.
  const purged = sweepTrash(db, deps.uploadsDir, undefined, now);

  return { surfaced, reminded: reminders.length, warned, forgotten, purged };
}

export function startScheduler(db: Db, deps: SchedulerDeps, intervalMs = 60_000): NodeJS.Timeout {
  runSchedulerTick(db, deps);
  const timer = setInterval(() => {
    try {
      runSchedulerTick(db, deps);
    } catch (error) {
      console.error('[scheduler] tick failed:', error);
    }
  }, intervalMs);
  timer.unref();
  return timer;
}
