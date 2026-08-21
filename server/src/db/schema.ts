import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = () => Math.floor(Date.now() / 1000);

export const users = sqliteTable('user', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdTs: integer('created_ts').notNull().$defaultFn(now),
  updatedTs: integer('updated_ts').notNull().$defaultFn(now),
  rowStatus: text('row_status', { enum: ['NORMAL', 'ARCHIVED'] }).notNull().default('NORMAL'),
  username: text('username').notNull().unique(),
  role: text('role', { enum: ['ADMIN', 'USER'] }).notNull().default('USER'),
  email: text('email').notNull().default(''),
  nickname: text('nickname').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url').notNull().default(''),
  description: text('description').notNull().default(''),
});

export const userSessions = sqliteTable('user_session', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdTs: integer('created_ts').notNull().$defaultFn(now),
  expiresTs: integer('expires_ts').notNull(),
  lastSeenTs: integer('last_seen_ts').notNull().$defaultFn(now),
});

export const memos = sqliteTable('memo', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uid: text('uid').notNull().unique(),
  creatorId: integer('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdTs: integer('created_ts').notNull().$defaultFn(now),
  updatedTs: integer('updated_ts').notNull().$defaultFn(now),
  rowStatus: text('row_status', { enum: ['NORMAL', 'ARCHIVED'] }).notNull().default('NORMAL'),
  content: text('content').notNull().default(''),
  visibility: text('visibility', { enum: ['PUBLIC', 'PROTECTED', 'PRIVATE'] })
    .notNull()
    .default('PRIVATE'),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  payload: text('payload').notNull().default('{}'),
  forgetAt: integer('forget_at'),
});

export const memoRelations = sqliteTable(
  'memo_relation',
  {
    memoId: integer('memo_id')
      .notNull()
      .references(() => memos.id, { onDelete: 'cascade' }),
    relatedMemoId: integer('related_memo_id')
      .notNull()
      .references(() => memos.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['REFERENCE', 'COMMENT'] }).notNull(),
  },
  (table) => [uniqueIndex('idx_memo_relation_unique').on(table.memoId, table.relatedMemoId, table.type)],
);

export const attachments = sqliteTable('attachment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uid: text('uid').notNull().unique(),
  creatorId: integer('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdTs: integer('created_ts').notNull().$defaultFn(now),
  filename: text('filename').notNull().default(''),
  type: text('type').notNull().default(''),
  size: integer('size').notNull().default(0),
  memoId: integer('memo_id').references(() => memos.id, { onDelete: 'set null' }),
  storagePath: text('storage_path').notNull(),
});

export const reactions = sqliteTable(
  'reaction',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    createdTs: integer('created_ts').notNull().$defaultFn(now),
    creatorId: integer('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    memoId: integer('memo_id')
      .notNull()
      .references(() => memos.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
  },
  (table) => [uniqueIndex('idx_reaction_unique').on(table.creatorId, table.memoId, table.emoji)],
);

export const memoShares = sqliteTable('memo_share', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uid: text('uid').notNull().unique(),
  memoId: integer('memo_id')
    .notNull()
    .references(() => memos.id, { onDelete: 'cascade' }),
  creatorId: integer('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdTs: integer('created_ts').notNull().$defaultFn(now),
  expiresTs: integer('expires_ts'),
});

export const inboxes = sqliteTable('inbox', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdTs: integer('created_ts').notNull().$defaultFn(now),
  senderId: integer('sender_id').notNull(),
  receiverId: integer('receiver_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['UNREAD', 'ARCHIVED'] }).notNull().default('UNREAD'),
  type: text('type', { enum: ['MEMO_COMMENT', 'MEMO_MENTION'] }).notNull(),
  memoId: integer('memo_id').references(() => memos.id, { onDelete: 'cascade' }),
});

export const userSettings = sqliteTable(
  'user_setting',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
  },
  (table) => [uniqueIndex('idx_user_setting_unique').on(table.userId, table.key)],
);

export const instanceSettings = sqliteTable('instance_setting', {
  name: text('name').notNull().unique(),
  value: text('value').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type MemoRow = typeof memos.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type ReactionRow = typeof reactions.$inferSelect;
export type MemoShareRow = typeof memoShares.$inferSelect;
export type InboxRow = typeof inboxes.$inferSelect;
export type MemoRelationRow = typeof memoRelations.$inferSelect;
