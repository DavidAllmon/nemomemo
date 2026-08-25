import { z } from 'zod';
import {
  ACCESS_TOKEN_SCOPES,
  CONTENT_LENGTH_LIMIT,
  DORY_WINDOWS,
  REMIND_REPEATS,
  ROLES,
  ROW_STATUSES,
  TAG_COLOR_NAMES,
  USERNAME_REGEX,
  VISIBILITIES,
  type AccessTokenScope,
  type RemindRepeat,
} from '../constants.js';

// ---------- Request schemas (validated at the route boundary) ----------

export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);

/**
 * Avatars are either uploaded images (data:image/* URIs, capped so a giant blob
 * can't bloat the user row) or plain web URLs — never javascript:, data:text/html,
 * or other scriptable schemes.
 */
export const avatarUrlSchema = z
  .string()
  .max(2_000_000)
  .refine(
    (value) =>
      value === '' ||
      value.startsWith('data:image/') ||
      (/^https?:\/\//.test(value) && value.length <= 2048),
    'Avatar must be an image data URI or a web URL',
  );

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const signupRequestSchema = z.object({
  username: z.string().regex(USERNAME_REGEX, 'Username must be 1-32 letters, numbers, or hyphens'),
  password: passwordSchema,
  email: emailSchema,
  nickname: z.string().max(64).optional(),
});

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(1).max(128),
});

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1).max(128),
  password: passwordSchema,
});

export const signinRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const createMemoRequestSchema = z.object({
  content: z.string().max(CONTENT_LENGTH_LIMIT),
  visibility: z.enum(VISIBILITIES).optional(),
  dory: z.boolean().optional(),
  doryWindow: z.enum(DORY_WINDOWS).optional(),
  surfaceAt: z.number().int().positive().optional(),
  attachmentUids: z.array(z.string()).max(20).optional(),
  relatedMemoUids: z.array(z.string()).max(20).optional(),
});

export const updateMemoRequestSchema = z.object({
  content: z.string().max(CONTENT_LENGTH_LIMIT).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  pinned: z.boolean().optional(),
  rowStatus: z.enum(ROW_STATUSES).optional(),
  dory: z.boolean().optional(),
  doryWindow: z.enum(DORY_WINDOWS).optional(),
  surfaceAt: z.number().int().positive().nullable().optional(),
  remindAt: z.number().int().positive().nullable().optional(),
  remindEvery: z.enum(REMIND_REPEATS).nullable().optional(),
  attachmentUids: z.array(z.string()).max(20).optional(),
  relatedMemoUids: z.array(z.string()).max(20).optional(),
});

export const bulkMemoRequestSchema = z.object({
  uids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['archive', 'unarchive', 'trash', 'tag']),
  /** Required when action = 'tag'. */
  tag: z.string().min(1).max(128).optional(),
});

export const createCommentRequestSchema = z.object({
  content: z.string().min(1).max(CONTENT_LENGTH_LIMIT),
});

export const reactionRequestSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const createShareRequestSchema = z.object({
  expiresIn: z.enum(['1d', '7d', '30d', 'never']).default('never'),
});

export const updateAccountRequestSchema = z.object({
  nickname: z.string().max(64).optional(),
  // '' passes validation for legacy accounts; the route forbids clearing a set email.
  email: emailSchema.or(z.literal('')).optional(),
  avatarUrl: avatarUrlSchema.optional(),
  description: z.string().max(512).optional(),
  password: passwordSchema.optional(),
});

export const adminCreateUserRequestSchema = z.object({
  username: z.string().regex(USERNAME_REGEX),
  email: emailSchema,
  // Omitted password = email an invite instead (requires SMTP on the instance).
  password: passwordSchema.optional(),
  role: z.enum(ROLES).default('USER'),
  nickname: z.string().max(64).optional(),
});

export const adminUpdateUserRequestSchema = z.object({
  role: z.enum(ROLES).optional(),
  rowStatus: z.enum(ROW_STATUSES).optional(),
  password: passwordSchema.optional(),
});

export const renameTagRequestSchema = z.object({
  from: z.string().min(1).max(128),
  to: z.string().min(1).max(128),
});

export const createAccessTokenRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
  scope: z.enum(ACCESS_TOKEN_SCOPES).default('FULL'),
  expiresIn: z.enum(['30d', '90d', '1y', 'never']).default('never'),
});

export const memoViewSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(64),
  filter: z.string().min(1).max(1024),
});

/** A one-tap memo skeleton, stored per member like saved views. */
export const memoTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(64),
  content: z.string().min(1).max(CONTENT_LENGTH_LIMIT),
});

export const userGeneralSettingSchema = z.object({
  defaultVisibility: z.enum(VISIBILITIES).default('PRIVATE'),
  theme: z.enum(['system', 'shallows', 'deep-sea']).default('system'),
  /** Tags the member keeps at the top of the sidebar. */
  pinnedTags: z.array(z.string().min(1).max(128)).max(20).default([]),
  /** Per-tag paint from the reef palette; tags absent here wear the default. */
  tagColors: z
    .record(z.string().min(1).max(128), z.enum(TAG_COLOR_NAMES))
    .refine((colors) => Object.keys(colors).length <= 200, 'Too many colored tags')
    .default({}),
});

export const updateUserSettingsRequestSchema = z.object({
  general: userGeneralSettingSchema.partial().optional(),
  memoViews: z.array(memoViewSchema).max(50).optional(),
  memoTemplates: z.array(memoTemplateSchema).max(20).optional(),
});

export const instanceGeneralSettingSchema = z.object({
  name: z.string().min(1).max(64).default('NemoMemo'),
  description: z.string().max(256).default(''),
  publicMode: z.boolean().default(true),
  allowRegistration: z.boolean().default(true),
  weekStartDay: z.number().int().min(0).max(6).default(0),
});

export const instanceMemoSettingSchema = z.object({
  contentLengthLimit: z.number().int().min(256).max(65536).default(CONTENT_LENGTH_LIMIT),
  reactions: z.array(z.string().min(1).max(16)).min(1).max(30),
});

export const updateInstanceSettingsRequestSchema = z.object({
  general: instanceGeneralSettingSchema.partial().optional(),
  memo: instanceMemoSettingSchema.partial().optional(),
});

export const inboxUpdateRequestSchema = z.object({
  status: z.enum(['UNREAD', 'READ', 'ARCHIVED']),
});

// ---------- Response DTO types ----------

export interface UserDto {
  username: string;
  nickname: string;
  role: (typeof ROLES)[number];
  avatarUrl: string;
  description: string;
  rowStatus: (typeof ROW_STATUSES)[number];
  createdTs: number;
  email?: string; // only present for the viewer / admin
  emailVerified?: boolean; // only present alongside email
}

export interface MemoPropertyDto {
  hasLink: boolean;
  hasCode: boolean;
  hasTaskList: boolean;
  hasIncompleteTasks: boolean;
  /** Number of unchecked `[ ]` items; 0 for memos saved before v1.17. */
  incompleteTasks?: number;
}

export interface AttachmentDto {
  uid: string;
  filename: string;
  type: string;
  size: number;
  createdTs: number;
  memoUid: string | null;
  /** OCR text (images) or transcript (audio); '' when none. */
  extractedText?: string;
}

export interface ReactionDto {
  emoji: string;
  count: number;
  reactedByViewer: boolean;
}

export interface RelatedMemoStubDto {
  uid: string;
  creator: string;
  snippet: string;
}

export interface MemoDto {
  uid: string;
  creator: UserDto;
  createdTs: number;
  updatedTs: number;
  rowStatus: (typeof ROW_STATUSES)[number];
  content: string;
  visibility: (typeof VISIBILITIES)[number];
  pinned: boolean;
  tags: string[];
  property: MemoPropertyDto;
  attachments: AttachmentDto[];
  reactions: ReactionDto[];
  commentCount: number;
  forgetAt: number | null;
  remindAt: number | null;
  remindEvery: RemindRepeat | null;
  surfaceAt: number | null;
  /** Set while the memo is in the trash; null otherwise. */
  deletedAt: number | null;
  parentUid: string | null;
  referencing: RelatedMemoStubDto[];
  referencedBy: RelatedMemoStubDto[];
}

export interface MemoListResponse {
  memos: MemoDto[];
  nextPageToken: string | null;
}

export interface MemoRevisionDto {
  id: number;
  content: string;
  /** When this content was replaced by an edit (epoch seconds). */
  createdTs: number;
}

export interface MemoHistoryResponse {
  revisions: MemoRevisionDto[];
}

export interface AccessTokenDto {
  id: number;
  name: string;
  scope: AccessTokenScope;
  createdTs: number;
  /** null until something actually uses the token. */
  lastUsedTs: number | null;
  expiresTs: number | null;
}

/** The plaintext token travels exactly once — at creation. */
export interface CreateAccessTokenResponse {
  token: AccessTokenDto;
  plaintext: string;
}

export interface ShareDto {
  token: string;
  createdTs: number;
  expiresTs: number | null;
}

export interface InboxDto {
  id: number;
  createdTs: number;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  type: 'MEMO_COMMENT' | 'MEMO_MENTION' | 'MEMO_THREAD' | 'REMINDER' | 'BOTTLE_ARRIVED' | 'DORY_WARNING';
  sender: UserDto | null;
  memoUid: string | null;
  memoSnippet: string | null;
}

export interface UserStatsDto {
  totalMemoCount: number;
  memoCreatedTimestamps: number[];
  tagCounts: Record<string, number>;
  linkCount: number;
  codeCount: number;
  taskCount: number;
  incompleteTaskCount: number;
  /** Total unchecked `[ ]` items across the counted memos. */
  openTaskCount: number;
  pinnedCount: number;
}

export interface InstanceProfileDto {
  name: string;
  description: string;
  version: string;
  publicMode: boolean;
  allowRegistration: boolean;
  needsSetup: boolean;
  emailEnabled: boolean;
  /** Live dictation (speech-to-text while composing) is configured. */
  dictationEnabled?: boolean;
  /** A Telegram capture bot is configured on this instance. */
  telegramEnabled?: boolean;
}

export type SigninResponse = { user: UserDto };

export type MemoViewDto = z.infer<typeof memoViewSchema>;
export type MemoTemplateDto = z.infer<typeof memoTemplateSchema>;
export type UserGeneralSetting = z.infer<typeof userGeneralSettingSchema>;
export type InstanceGeneralSetting = z.infer<typeof instanceGeneralSettingSchema>;
export type InstanceMemoSetting = z.infer<typeof instanceMemoSettingSchema>;
