export const VISIBILITIES = ['PRIVATE', 'PROTECTED', 'PUBLIC'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const ROW_STATUSES = ['NORMAL', 'ARCHIVED'] as const;
export type RowStatus = (typeof ROW_STATUSES)[number];

export const ROLES = ['ADMIN', 'USER'] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_REACTIONS = [
  '👍', '💙', '🔥', '👏', '😂', '👌', '🐠', '👀', '🤔', '🎉', '💡', '✅', '🫧',
] as const;

/** Max memo content length in bytes (matches memos). */
export const CONTENT_LENGTH_LIMIT = 8192;

/** Dory memos are forgotten this many seconds after being marked. */
export const DORY_TTL_SECONDS = 24 * 60 * 60;

export const SHARE_EXPIRY_PRESETS = {
  '1d': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  never: null,
} as const;
export type ShareExpiryPreset = keyof typeof SHARE_EXPIRY_PRESETS;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 200;

/** Username: 1-32 chars, alphanumeric + hyphen, must start/end alphanumeric. */
export const USERNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])?$/;

export const APP_NAME = 'NemoMemo';
