import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  AttachmentDto,
  InboxDto,
  InstanceGeneralSetting,
  InstanceMemoSetting,
  InstanceProfileDto,
  MemoDto,
  MemoListResponse,
  MemoViewDto,
  ShareDto,
  UserDto,
  UserGeneralSetting,
  UserStatsDto,
} from '@nemomemo/shared';
import { api, apiUpload, ApiError } from '@/lib/api.js';

export const keys = {
  viewer: ['viewer'] as const,
  instance: ['instance'] as const,
  instanceMemoSetting: ['instance', 'memo-setting'] as const,
  instanceSettings: ['instance', 'settings'] as const,
  memoList: (params: Record<string, string | undefined>) => ['memos', 'list', params] as const,
  memo: (uid: string) => ['memos', 'detail', uid] as const,
  // Under the 'memos' prefix so useInvalidateMemos refreshes it with every edit.
  dory: ['memos', 'dory'] as const,
  comments: (uid: string) => ['memos', 'comments', uid] as const,
  shares: (uid: string) => ['memos', 'shares', uid] as const,
  sharedMemo: (token: string) => ['shares', token] as const,
  tags: ['tags'] as const,
  stats: (username: string) => ['stats', username] as const,
  user: (username: string) => ['users', username] as const,
  userSettings: ['user-settings'] as const,
  inbox: (status: string) => ['inbox', status] as const,
  attachments: (params: Record<string, string | undefined>) => ['attachments', params] as const,
  members: ['members'] as const,
  cloudBilling: ['cloud', 'billing'] as const,
  cloudSnapshots: ['cloud', 'snapshots'] as const,
};

// ---------- Viewer & instance ----------

export function useViewer() {
  return useQuery({
    queryKey: keys.viewer,
    queryFn: async () => {
      try {
        const { user } = await api<{ user: UserDto }>('GET', '/api/v1/auth/me');
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export interface CloudBillingInfo {
  status: 'provisioned' | 'active' | 'past_due' | 'suspended' | 'canceled';
  limits: { maxMembers: number; maxStorageBytes: number } | null;
}

/** Hosted reefs only: 403/404 (self-host, non-admin) resolves to null and hides all cloud UI. */
export function useCloudBilling(enabled: boolean) {
  return useQuery({
    queryKey: keys.cloudBilling,
    queryFn: async () => {
      try {
        return await api<CloudBillingInfo>('GET', '/api/v1/cloud/billing');
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
        throw error;
      }
    },
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export interface CloudSnapshotInfo {
  snapshots: { id: string; time: string }[];
  restore: {
    state: 'queued' | 'restoring' | 'staged' | 'failed' | 'done';
    snapshotId: string;
    requestedTs: number;
    updatedTs: number;
    message?: string;
  } | null;
}

const RESTORE_PENDING = ['queued', 'restoring', 'staged'];

/** Hosted reefs only; polls while a restore is in flight so the card live-updates. */
export function useCloudSnapshots(enabled: boolean) {
  return useQuery({
    queryKey: keys.cloudSnapshots,
    queryFn: async () => {
      try {
        return await api<CloudSnapshotInfo>('GET', '/api/v1/cloud/snapshots');
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
        throw error;
      }
    },
    enabled,
    refetchInterval: (query) => {
      const restore = query.state.data?.restore;
      return restore && RESTORE_PENDING.includes(restore.state) ? 5_000 : false;
    },
    retry: false,
  });
}

export function useInstanceProfile() {
  return useQuery({
    queryKey: keys.instance,
    queryFn: () => api<InstanceProfileDto>('GET', '/api/v1/instance/profile'),
    staleTime: 5 * 60_000,
  });
}

export function useInstanceMemoSetting() {
  return useQuery({
    queryKey: keys.instanceMemoSetting,
    queryFn: () => api<InstanceMemoSetting>('GET', '/api/v1/instance/settings/memo'),
    staleTime: 5 * 60_000,
  });
}

// ---------- Memo lists ----------

export interface MemoListParams {
  scope: 'home' | 'explore' | 'profile';
  state?: 'NORMAL' | 'ARCHIVED';
  creator?: string;
  filter?: string;
  orderBy?: 'created_ts' | 'updated_ts';
  dir?: 'asc' | 'desc';
  /** Rows per page; the server clamps to MAX_PAGE_SIZE (200). */
  pageSize?: number;
}

function listQueryString(params: MemoListParams, pageToken?: string): string {
  const search = new URLSearchParams();
  search.set('scope', params.scope);
  if (params.state) search.set('state', params.state);
  if (params.creator) search.set('creator', params.creator);
  if (params.filter) search.set('filter', params.filter);
  if (params.orderBy) search.set('orderBy', params.orderBy);
  if (params.dir) search.set('dir', params.dir);
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  if (pageToken) search.set('pageToken', pageToken);
  return search.toString();
}

export function useMemoList(params: MemoListParams) {
  return useInfiniteQuery({
    queryKey: keys.memoList(params as unknown as Record<string, string | undefined>),
    queryFn: ({ pageParam }) =>
      api<MemoListResponse>('GET', `/api/v1/memos?${listQueryString(params, pageParam || undefined)}`),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken,
    staleTime: 30_000,
  });
}

export function useMemo_(uid: string) {
  return useQuery({
    queryKey: keys.memo(uid),
    queryFn: async () => (await api<{ memo: MemoDto }>('GET', `/api/v1/memos/${uid}`)).memo,
  });
}

export function useComments(uid: string) {
  return useQuery({
    queryKey: keys.comments(uid),
    queryFn: async () => (await api<{ memos: MemoDto[] }>('GET', `/api/v1/memos/${uid}/comments`)).memos,
  });
}

export function useSharedMemo(token: string) {
  return useQuery({
    queryKey: keys.sharedMemo(token),
    queryFn: async () => (await api<{ memo: MemoDto }>('GET', `/api/v1/shares/${token}`)).memo,
    retry: false,
  });
}

export interface DoryPageData {
  fading: MemoDto[];
  bottles: MemoDto[];
  forgottenCount: number;
}

/** Dory's Memory: everything fading (soonest first) + bottles still at sea. */
export function useDoryPage() {
  return useQuery({
    queryKey: keys.dory,
    queryFn: () => api<DoryPageData>('GET', '/api/v1/memos/dory'),
    staleTime: 30_000,
  });
}

export function useInvalidateMemos() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['memos'] });
    void client.invalidateQueries({ queryKey: keys.tags });
    void client.invalidateQueries({ queryKey: ['stats'] });
    // Share pages read through ['shares', token]; keep them in sync with edits.
    void client.invalidateQueries({ queryKey: ['shares'] });
  };
}

// ---------- Memo mutations ----------

export interface CreateMemoInput {
  content: string;
  visibility?: string;
  dory?: boolean;
  doryWindow?: string;
  surfaceAt?: number;
  attachmentUids?: string[];
}

export function useCreateMemo() {
  const invalidate = useInvalidateMemos();
  return useMutation({
    mutationFn: (input: CreateMemoInput) => api<{ memo: MemoDto }>('POST', '/api/v1/memos', input),
    onSuccess: invalidate,
  });
}

export function useUpdateMemo() {
  const client = useQueryClient();
  const invalidate = useInvalidateMemos();
  return useMutation({
    mutationFn: ({ uid, ...patch }: { uid: string } & Record<string, unknown>) =>
      api<{ memo: MemoDto }>('PATCH', `/api/v1/memos/${uid}`, patch),
    onSuccess: ({ memo }) => {
      client.setQueryData(keys.memo(memo.uid), memo);
      invalidate();
    },
  });
}

/** Go fish: one random memo from the viewer's own reef. */
export function useRandomMemo() {
  return useMutation({
    mutationFn: async () =>
      (await api<{ memo: MemoDto }>('GET', '/api/v1/memos/random')).memo,
  });
}

export function useDeleteMemo() {
  const invalidate = useInvalidateMemos();
  return useMutation({
    mutationFn: (uid: string) => api<{ ok: boolean }>('DELETE', `/api/v1/memos/${uid}`),
    onSuccess: invalidate,
  });
}

export function useCreateComment(parentUid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api<{ memo: MemoDto }>('POST', `/api/v1/memos/${parentUid}/comments`, { content }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.comments(parentUid) });
      void client.invalidateQueries({ queryKey: keys.memo(parentUid) });
      // Feed cards show commentCount — refresh lists too.
      void client.invalidateQueries({ queryKey: ['memos', 'list'] });
    },
  });
}

export function useToggleReaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, emoji, active }: { uid: string; emoji: string; active: boolean }) =>
      active
        ? api<{ memo: MemoDto }>('DELETE', `/api/v1/memos/${uid}/reactions/${encodeURIComponent(emoji)}`)
        : api<{ memo: MemoDto }>('POST', `/api/v1/memos/${uid}/reactions`, { emoji }),
    onSuccess: ({ memo }) => {
      client.setQueryData(keys.memo(memo.uid), memo);
      void client.invalidateQueries({ queryKey: ['memos', 'list'] });
      void client.invalidateQueries({ queryKey: ['memos', 'comments'] });
      void client.invalidateQueries({ queryKey: ['shares'] });
    },
  });
}

// ---------- Shares ----------

export function useShares(uid: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.shares(uid),
    queryFn: async () => (await api<{ shares: ShareDto[] }>('GET', `/api/v1/memos/${uid}/shares`)).shares,
    enabled,
  });
}

export function useCreateShare(uid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (expiresIn: string) =>
      api<{ share: ShareDto }>('POST', `/api/v1/memos/${uid}/shares`, { expiresIn }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.shares(uid) }),
  });
}

export function useRevokeShare(uid: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api<{ ok: boolean }>('DELETE', `/api/v1/shares/${token}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.shares(uid) }),
  });
}

// ---------- Tags, stats, users ----------

export function useTags(enabled = true) {
  return useQuery({
    queryKey: keys.tags,
    queryFn: async () => (await api<{ tags: Record<string, number> }>('GET', '/api/v1/users/-/tags')).tags,
    enabled,
    staleTime: 60_000,
  });
}

export function useMentionable(enabled = true) {
  return useQuery({
    queryKey: ['mentionable'],
    queryFn: async () =>
      (await api<{ users: { username: string; nickname: string }[] }>('GET', '/api/v1/users/-/mentionable'))
        .users,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useUserStats(username: string) {
  return useQuery({
    queryKey: keys.stats(username),
    queryFn: () => api<UserStatsDto>('GET', `/api/v1/users/${username}/stats`),
    staleTime: 60_000,
  });
}

export function useUser(username: string) {
  return useQuery({
    queryKey: keys.user(username),
    queryFn: async () => (await api<{ user: UserDto }>('GET', `/api/v1/users/${username}`)).user,
  });
}

export function useUserSettings(enabled = true) {
  return useQuery({
    queryKey: keys.userSettings,
    queryFn: () =>
      api<{ general: UserGeneralSetting; memoViews: MemoViewDto[] }>('GET', '/api/v1/users/-/settings'),
    enabled,
    staleTime: 60_000,
  });
}

export function useUpdateUserSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: { general?: Partial<UserGeneralSetting>; memoViews?: MemoViewDto[] }) =>
      api<{ general: UserGeneralSetting; memoViews: MemoViewDto[] }>('PATCH', '/api/v1/users/-/settings', patch),
    onSuccess: (data) => client.setQueryData(keys.userSettings, data),
  });
}

/**
 * Pin/unpin one tag. Reads the freshest list from the cache and writes it back
 * optimistically, so two clicks in quick succession compose instead of the
 * second one overwriting the first from a stale render closure.
 */
export function useTogglePinnedTag() {
  const client = useQueryClient();
  const update = useUpdateUserSettings();
  return (tag: string) => {
    const current = client.getQueryData<{ general: UserGeneralSetting; memoViews: MemoViewDto[] }>(
      keys.userSettings,
    );
    const pinned = current?.general.pinnedTags ?? [];
    const next = pinned.includes(tag) ? pinned.filter((name) => name !== tag) : [...pinned, tag];
    if (current) {
      client.setQueryData(keys.userSettings, {
        ...current,
        general: { ...current.general, pinnedTags: next },
      });
    }
    update.mutate({ general: { pinnedTags: next } });
  };
}

// ---------- Inbox ----------

export function useInbox(status: 'UNREAD' | 'READ' | 'ARCHIVED', enabled = true) {
  return useQuery({
    queryKey: keys.inbox(status),
    queryFn: () => api<{ items: InboxDto[]; unreadCount: number }>('GET', `/api/v1/inbox?status=${status}`),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useInboxAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'read' | 'unread' | 'archive' | 'delete' }) =>
      action === 'delete'
        ? api<{ ok: boolean }>('DELETE', `/api/v1/inbox/${id}`)
        : api<{ ok: boolean }>('PATCH', `/api/v1/inbox/${id}`, {
            status: action === 'archive' ? 'ARCHIVED' : action === 'read' ? 'READ' : 'UNREAD',
          }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

export function useReadAllInbox() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: boolean }>('POST', '/api/v1/inbox/read-all'),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

// ---------- Attachments ----------

export function useAttachments(params: { type?: string; unlinked?: boolean; tag?: string }) {
  return useQuery({
    queryKey: keys.attachments({
      type: params.type,
      unlinked: params.unlinked ? 'true' : undefined,
      tag: params.tag,
    }),
    queryFn: () => {
      const search = new URLSearchParams();
      if (params.type) search.set('type', params.type);
      if (params.unlinked) search.set('unlinked', 'true');
      if (params.tag) search.set('tag', params.tag);
      return api<{ attachments: AttachmentDto[] }>('GET', `/api/v1/attachments?${search}`);
    },
  });
}

export function useUploadAttachment() {
  return useMutation({
    mutationFn: (file: File) => apiUpload<{ attachment: AttachmentDto }>('/api/v1/attachments', file),
  });
}

export function useDeleteAttachment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (uid: string) => api<{ ok: boolean }>('DELETE', `/api/v1/attachments/${uid}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['attachments'] }),
  });
}

export function useDeleteUnusedAttachments() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ deleted: number }>('DELETE', '/api/v1/attachments/unused'),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['attachments'] }),
  });
}

// ---------- Admin ----------

export function useMembers(enabled: boolean) {
  return useQuery({
    queryKey: keys.members,
    queryFn: () => api<{ users: UserDto[] }>('GET', '/api/v1/users'),
    enabled,
  });
}

export function useInstanceSettings(enabled: boolean) {
  return useQuery({
    queryKey: keys.instanceSettings,
    queryFn: () =>
      api<{ general: InstanceGeneralSetting; memo: InstanceMemoSetting }>('GET', '/api/v1/instance/settings'),
    enabled,
  });
}
