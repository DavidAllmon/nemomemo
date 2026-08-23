import { asc, eq } from 'drizzle-orm';
import path from 'node:path';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { attachments, memos, type MemoRow, type UserRow } from '../db/schema.js';
import { checkMemoRead } from './acl.js';
import { getParentMemo, parsePayload } from './memo-service.js';

export interface MarkdownExport {
  /** Markdown documents to place in the zip, one per memo. */
  documents: { path: string; markdown: string }[];
  /** Attachment files to copy in alongside them. */
  files: { path: string; absolutePath: string }[];
}

const isoSeconds = (epoch: number): string => new Date(epoch * 1000).toISOString().replace('.000Z', 'Z');

/**
 * A human-readable export of one user's own memos: markdown files with YAML
 * frontmatter plus their attachments. Every memo still passes through
 * checkMemoRead so expired Dory memos never leak into an export.
 */
export function buildMarkdownExport(db: Db, config: Config, viewer: UserRow): MarkdownExport {
  const rows = db
    .select()
    .from(memos)
    .where(eq(memos.creatorId, viewer.id))
    .orderBy(asc(memos.createdTs))
    .all();

  const documents: MarkdownExport['documents'] = [];
  const files: MarkdownExport['files'] = [];

  for (const row of rows) {
    const parent = getParentMemo(db, row.id);
    if (checkMemoRead(row, parent, viewer, { allowAnonymous: false }) != null) continue;

    const attachmentRows = db.select().from(attachments).where(eq(attachments.memoId, row.id)).all();
    const attachmentPaths = attachmentRows.map((a) => {
      const zipPath = `attachments/${a.uid}/${a.filename || 'file'}`;
      files.push({ path: zipPath, absolutePath: path.resolve(config.uploadsDir, a.storagePath) });
      return zipPath;
    });

    documents.push({
      path: `${parent ? 'comments' : 'memos'}/${markdownFilename(row)}`,
      markdown: renderMemoMarkdown(row, parent, {
        attachmentPaths,
        content: row.content.replaceAll('/file/attachments/', 'attachments/'),
      }),
    });
  }

  return { documents, files };
}

export function markdownFilename(row: MemoRow): string {
  return `${isoSeconds(row.createdTs).slice(0, 10)}-${row.uid}.md`;
}

/** Frontmattered markdown for one memo. Options cover the bulk-zip case:
 *  a rewritten content body and the zip-relative attachment paths. */
export function renderMemoMarkdown(
  row: MemoRow,
  parent: MemoRow | null,
  opts: { attachmentPaths?: string[]; content?: string } = {},
): string {
  const attachmentPaths = opts.attachmentPaths ?? [];
  const lines: string[] = [`created: ${isoSeconds(row.createdTs)}`];
  if (row.updatedTs !== row.createdTs) lines.push(`updated: ${isoSeconds(row.updatedTs)}`);
  lines.push(`visibility: ${row.visibility}`);
  if (row.pinned) lines.push('pinned: true');
  if (row.rowStatus === 'ARCHIVED') lines.push('archived: true');
  if (row.forgetAt != null) lines.push(`forgets: ${isoSeconds(row.forgetAt)}`);
  if (row.surfaceAt != null) lines.push(`surfaces: ${isoSeconds(row.surfaceAt)}`);
  if (row.remindAt != null) lines.push(`reminds: ${isoSeconds(row.remindAt)}`);
  if (parent) lines.push(`comment_on: ${parent.uid}`);
  const tags = parsePayload(row.payload).tags ?? [];
  if (tags.length > 0) {
    lines.push('tags:', ...tags.map((tag) => `  - ${JSON.stringify(tag)}`));
  }
  if (attachmentPaths.length > 0) {
    lines.push('attachments:', ...attachmentPaths.map((p) => `  - ${JSON.stringify(p)}`));
  }
  return `---\n${lines.join('\n')}\n---\n\n${opts.content ?? row.content}\n`;
}
