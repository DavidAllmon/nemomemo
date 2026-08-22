import { z } from 'zod';
import {
  CONTENT_LENGTH_LIMIT,
  ROLES,
  ROW_STATUSES,
  USERNAME_REGEX,
  VISIBILITIES,
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

export const signupRequestSchema = z.object({
  username: z.string().regex(USERNAME_REGEX, 'Username must be 1-32 letters, numbers, or hyphens'),
  password: passwordSchema,
  nickname: z.string().max(64).optional(),
});

export const signinRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const createMemoRequestSchema = z.object({
  content: z.string().max(CONTENT_LENGTH_LIMIT),
  visibility: z.enum(VISIBILITIES).optional(),
  dory: z.boolean().optional(),
  attachmentUids: z.array(z.string()).max(20).optional(),
  relatedMemoUids: z.array(z.string()).max(20).optional(),
});

export const updateMemoRequestSchema = z.object({
  content: z.string().max(CONTENT_LENGTH_LIMIT).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  pinned: z.boolean().optional(),
  rowStatus: z.enum(ROW_STATUSES).optional(),
  dory: z.boolean().optional(),
  attachmentUids: z.array(z.string()).max(20).optional(),
  relatedMemoUids: z.array(z.string()).max(20).optional(),
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
  email: z.string().email().or(z.literal('')).optional(),
  avatarUrl: avatarUrlSchema.optional(),
  description: z.string().max(512).optional(),
  password: passwordSchema.optional(),
});

export const adminCreateUserRequestSchema = z.object({
  username: z.string().regex(USERNAME_REGEX),
  password: passwordSchema,
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

export const memoViewSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(64),
  filter: z.string().min(1).max(1024),
});

export const userGeneralSettingSchema = z.object({
  defaultVisibility: z.enum(VISIBILITIES).default('PRIVATE'),
  theme: z.enum(['system', 'shallows', 'deep-sea']).default('system'),
});

export const updateUserSettingsRequestSchema = z.object({
  general: userGeneralSettingSchema.partial().optional(),
  memoViews: z.array(memoViewSchema).max(50).optional(),
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
  status: z.enum(['UNREAD', 'ARCHIVED']),
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
}

export interface MemoPropertyDto {
  hasLink: boolean;
  hasCode: boolean;
  hasTaskList: boolean;
  hasIncompleteTasks: boolean;
}

export interface AttachmentDto {
  uid: string;
  filename: string;
  type: string;
  size: number;
  createdTs: number;
  memoUid: string | null;
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
  parentUid: string | null;
  referencing: RelatedMemoStubDto[];
  referencedBy: RelatedMemoStubDto[];
}

export interface MemoListResponse {
  memos: MemoDto[];
  nextPageToken: string | null;
}

export interface ShareDto {
  token: string;
  createdTs: number;
  expiresTs: number | null;
}

export interface InboxDto {
  id: number;
  createdTs: number;
  status: 'UNREAD' | 'ARCHIVED';
  type: 'MEMO_COMMENT' | 'MEMO_MENTION' | 'MEMO_THREAD';
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
  pinnedCount: number;
}

export interface InstanceProfileDto {
  name: string;
  description: string;
  version: string;
  publicMode: boolean;
  allowRegistration: boolean;
  needsSetup: boolean;
}

export type SigninResponse = { user: UserDto };

export type MemoViewDto = z.infer<typeof memoViewSchema>;
export type UserGeneralSetting = z.infer<typeof userGeneralSettingSchema>;
export type InstanceGeneralSetting = z.infer<typeof instanceGeneralSettingSchema>;
export type InstanceMemoSetting = z.infer<typeof instanceMemoSettingSchema>;
