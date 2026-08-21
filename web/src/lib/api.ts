export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let code = 'INTERNAL';
    let message = response.statusText;
    try {
      const json = (await response.json()) as { error?: { code?: string; message?: string } };
      code = json.error?.code ?? code;
      message = json.error?.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}

export async function apiUpload<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(response.status, json?.error?.code ?? 'INTERNAL', json?.error?.message ?? 'Upload failed');
  }
  return (await response.json()) as T;
}

export function fileUrl(uid: string, filename: string, opts: { thumbnail?: boolean; share?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.thumbnail) params.set('thumbnail', '1');
  if (opts.share) params.set('share', opts.share);
  const query = params.toString();
  return `/file/attachments/${uid}/${encodeURIComponent(filename)}${query ? `?${query}` : ''}`;
}
