import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { nowSeconds } from '../lib/time.js';

export type ReefStatus = 'provisioned' | 'active' | 'past_due' | 'suspended' | 'canceled';

export interface ReefRow {
  id: number;
  slug: string;
  status: ReefStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdTs: number;
  statusChangedTs: number | null;
}

/** Lowercase DNS label, 1–40 chars, no leading/trailing hyphen, no dots. */
export const REEF_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Hostnames that must never become a customer reef. */
export const RESERVED_SLUGS = new Set([
  'app', 'www', 'demo', 'api', 'admin', 'mail', 'smtp', 'status', 'docs', 'blog',
  'help', 'support', 'billing', 'cloud', 'ftp', 'ns1', 'ns2', 'staging', 'test',
]);

// The registry exists only in cloud mode and deliberately has its own migration
// chain — it must never touch the tenant schema or its migrations.
const REGISTRY_MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '0001_init',
    sql: `
      CREATE TABLE reef (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'provisioned',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        created_ts BIGINT NOT NULL
      );
      CREATE INDEX idx_reef_stripe_customer ON reef (stripe_customer_id);
      CREATE TABLE claim_token (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        reef_id INTEGER NOT NULL REFERENCES reef(id) ON DELETE CASCADE,
        expires_ts BIGINT NOT NULL,
        used_ts BIGINT
      );
    `,
  },
  {
    // When did a reef last change status? Drives the 90-day suspended-reef
    // deletion promise in the ToS. Null = never changed since this migration.
    name: '0002_status_changed_ts',
    sql: `ALTER TABLE reef ADD COLUMN status_changed_ts BIGINT;`,
  },
];

interface RawReefRow {
  id: number;
  slug: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_ts: number;
  status_changed_ts: number | null;
}

function toReefRow(raw: RawReefRow): ReefRow {
  return {
    id: raw.id,
    slug: raw.slug,
    status: raw.status as ReefStatus,
    stripeCustomerId: raw.stripe_customer_id,
    stripeSubscriptionId: raw.stripe_subscription_id,
    createdTs: raw.created_ts,
    statusChangedTs: raw.status_changed_ts,
  };
}

export class Registry {
  readonly sqlite: Database.Database;

  constructor(filename: string) {
    if (filename !== ':memory:') {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
    }
    this.sqlite = new Database(filename);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma('busy_timeout = 5000');
    this.migrate();
  }

  private migrate(): void {
    this.sqlite.exec(
      'CREATE TABLE IF NOT EXISTS registry_migration (name TEXT NOT NULL UNIQUE, applied_ts BIGINT NOT NULL)',
    );
    const applied = new Set(
      (this.sqlite.prepare('SELECT name FROM registry_migration').all() as { name: string }[]).map(
        (row) => row.name,
      ),
    );
    for (const migration of REGISTRY_MIGRATIONS) {
      if (applied.has(migration.name)) continue;
      const apply = this.sqlite.transaction(() => {
        this.sqlite.exec(migration.sql);
        this.sqlite
          .prepare('INSERT INTO registry_migration (name, applied_ts) VALUES (?, ?)')
          .run(migration.name, nowSeconds());
      });
      apply();
    }
  }

  getReefBySlug(slug: string): ReefRow | null {
    const raw = this.sqlite.prepare('SELECT * FROM reef WHERE slug = ?').get(slug) as
      | RawReefRow
      | undefined;
    return raw ? toReefRow(raw) : null;
  }

  getReefById(id: number): ReefRow | null {
    const raw = this.sqlite.prepare('SELECT * FROM reef WHERE id = ?').get(id) as
      | RawReefRow
      | undefined;
    return raw ? toReefRow(raw) : null;
  }

  getReefByStripeCustomerId(customerId: string): ReefRow | null {
    const raw = this.sqlite
      .prepare('SELECT * FROM reef WHERE stripe_customer_id = ?')
      .get(customerId) as RawReefRow | undefined;
    return raw ? toReefRow(raw) : null;
  }

  createReef(
    slug: string,
    fields: { status?: ReefStatus; stripeCustomerId?: string; stripeSubscriptionId?: string } = {},
  ): ReefRow {
    if (!REEF_SLUG_RE.test(slug)) throw new Error(`Invalid reef slug: ${slug}`);
    if (RESERVED_SLUGS.has(slug)) throw new Error(`Reserved reef slug: ${slug}`);
    const raw = this.sqlite
      .prepare(
        `INSERT INTO reef (slug, status, stripe_customer_id, stripe_subscription_id, created_ts)
         VALUES (?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        slug,
        fields.status ?? 'provisioned',
        fields.stripeCustomerId ?? null,
        fields.stripeSubscriptionId ?? null,
        nowSeconds(),
      ) as RawReefRow;
    return toReefRow(raw);
  }

  setReefStatus(slug: string, status: ReefStatus): void {
    this.sqlite
      .prepare("UPDATE reef SET status = ?, status_changed_ts = strftime('%s','now') WHERE slug = ?")
      .run(status, slug);
  }

  setReefStatusById(id: number, status: ReefStatus): void {
    this.sqlite
      .prepare("UPDATE reef SET status = ?, status_changed_ts = strftime('%s','now') WHERE id = ?")
      .run(status, id);
  }

  /** Suspended reefs whose suspension is older than the cutoff (ToS 90-day grace). */
  listSuspendedBefore(cutoffTs: number): ReefRow[] {
    return (
      this.sqlite
        .prepare(
          "SELECT * FROM reef WHERE status = 'suspended' AND COALESCE(status_changed_ts, created_ts) < ?",
        )
        .all(cutoffTs) as RawReefRow[]
    ).map(toReefRow);
  }

  updateReefSubscription(id: number, subscriptionId: string): void {
    this.sqlite.prepare('UPDATE reef SET stripe_subscription_id = ? WHERE id = ?').run(subscriptionId, id);
  }

  renameReef(id: number, slug: string): void {
    if (!REEF_SLUG_RE.test(slug)) throw new Error(`Invalid reef slug: ${slug}`);
    if (RESERVED_SLUGS.has(slug)) throw new Error(`Reserved reef slug: ${slug}`);
    this.sqlite.prepare('UPDATE reef SET slug = ? WHERE id = ?').run(slug, id);
  }

  createClaimToken(reefId: number, tokenHash: string, expiresTs: number): void {
    this.sqlite
      .prepare('INSERT INTO claim_token (token_hash, reef_id, expires_ts) VALUES (?, ?, ?)')
      .run(tokenHash, reefId, expiresTs);
  }

  getClaimToken(tokenHash: string): { id: number; reefId: number; expiresTs: number; usedTs: number | null } | null {
    const raw = this.sqlite
      .prepare('SELECT id, reef_id, expires_ts, used_ts FROM claim_token WHERE token_hash = ?')
      .get(tokenHash) as { id: number; reef_id: number; expires_ts: number; used_ts: number | null } | undefined;
    return raw
      ? { id: raw.id, reefId: raw.reef_id, expiresTs: raw.expires_ts, usedTs: raw.used_ts }
      : null;
  }

  markClaimTokenUsed(id: number): void {
    this.sqlite.prepare('UPDATE claim_token SET used_ts = ? WHERE id = ?').run(nowSeconds(), id);
  }

  listReefs(): ReefRow[] {
    return (this.sqlite.prepare('SELECT * FROM reef ORDER BY id').all() as RawReefRow[]).map(
      toReefRow,
    );
  }

  close(): void {
    this.sqlite.close();
  }
}
