import {
  DEFAULT_REACTIONS,
  instanceGeneralSettingSchema,
  instanceMemoSettingSchema,
  memoViewSchema,
  userGeneralSettingSchema,
  type InstanceGeneralSetting,
  type InstanceMemoSetting,
  type MemoViewDto,
  type UserGeneralSetting,
} from '@nemomemo/shared';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { instanceSettings, userSettings } from '../db/schema.js';

// ---------- Instance settings ----------

/** Structural parser type sidesteps zod's input/output variance on schemas with defaults. */
type Parser<T> = { parse: (data: unknown) => T };

function readInstanceSetting<T>(db: Db, name: string, schema: Parser<T>, fallback: T): T {
  const row = db.select().from(instanceSettings).where(eq(instanceSettings.name, name)).get();
  if (!row) return fallback;
  try {
    return schema.parse(JSON.parse(row.value));
  } catch {
    return fallback;
  }
}

function writeInstanceSetting(db: Db, name: string, value: unknown): void {
  const serialized = JSON.stringify(value);
  db.insert(instanceSettings)
    .values({ name, value: serialized })
    .onConflictDoUpdate({ target: instanceSettings.name, set: { value: serialized } })
    .run();
}

export function getInstanceGeneral(db: Db): InstanceGeneralSetting {
  return readInstanceSetting(
    db,
    'GENERAL',
    instanceGeneralSettingSchema,
    instanceGeneralSettingSchema.parse({}),
  );
}

export function setInstanceGeneral(db: Db, patch: Partial<InstanceGeneralSetting>): InstanceGeneralSetting {
  const next = instanceGeneralSettingSchema.parse({ ...getInstanceGeneral(db), ...patch });
  writeInstanceSetting(db, 'GENERAL', next);
  return next;
}

export function getInstanceMemoSetting(db: Db): InstanceMemoSetting {
  return readInstanceSetting(
    db,
    'MEMO',
    instanceMemoSettingSchema,
    instanceMemoSettingSchema.parse({ reactions: [...DEFAULT_REACTIONS] }),
  );
}

export function setInstanceMemoSetting(db: Db, patch: Partial<InstanceMemoSetting>): InstanceMemoSetting {
  const next = instanceMemoSettingSchema.parse({ ...getInstanceMemoSetting(db), ...patch });
  writeInstanceSetting(db, 'MEMO', next);
  return next;
}

// ---------- User settings ----------

function readUserSetting<T>(db: Db, userId: number, key: string, schema: Parser<T>, fallback: T): T {
  const row = db
    .select()
    .from(userSettings)
    .where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)))
    .get();
  if (!row) return fallback;
  try {
    return schema.parse(JSON.parse(row.value));
  } catch {
    return fallback;
  }
}

function writeUserSetting(db: Db, userId: number, key: string, value: unknown): void {
  const serialized = JSON.stringify(value);
  db.insert(userSettings)
    .values({ userId, key, value: serialized })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.key],
      set: { value: serialized },
    })
    .run();
}

export function getUserGeneral(db: Db, userId: number): UserGeneralSetting {
  return readUserSetting(
    db,
    userId,
    'GENERAL',
    userGeneralSettingSchema,
    userGeneralSettingSchema.parse({}),
  );
}

export function setUserGeneral(db: Db, userId: number, patch: Partial<UserGeneralSetting>): UserGeneralSetting {
  const next = userGeneralSettingSchema.parse({ ...getUserGeneral(db, userId), ...patch });
  writeUserSetting(db, userId, 'GENERAL', next);
  return next;
}

const memoViewsSchema = z.array(memoViewSchema);

export function getMemoViews(db: Db, userId: number): MemoViewDto[] {
  return readUserSetting(db, userId, 'MEMO_VIEWS', memoViewsSchema, []);
}

export function setMemoViews(db: Db, userId: number, views: MemoViewDto[]): MemoViewDto[] {
  const next = memoViewsSchema.parse(views);
  writeUserSetting(db, userId, 'MEMO_VIEWS', next);
  return next;
}
