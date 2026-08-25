import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { memos, telegramChats, telegramLinkCodes, users } from '../db/schema.js';
import { nowSeconds } from '../lib/time.js';
import { storeAttachment } from './attachment-service.js';
import { buildPayload, newUid } from './memo-service.js';
import type { OcrQueue } from './ocr.js';
import { getUserGeneral } from './settings.js';

/** How long a link code stays good. Long enough to switch apps, short enough to be safe. */
export const LINK_CODE_TTL_SECONDS = 15 * 60;
/** Unambiguous alphabet: no O/0, no I/1/l — these get read aloud and retyped. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

// ---------- The slice of Telegram's API we actually use ----------

export interface TelegramFile {
  file_id: string;
  file_size?: number;
  mime_type?: string;
  file_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  caption?: string;
  photo?: TelegramFile[];
  voice?: TelegramFile;
  audio?: TelegramFile;
  video?: TelegramFile;
  document?: TelegramFile;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramDeps {
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  ocr?: Pick<OcrQueue, 'enqueue'> | null;
  transcribe?: Pick<OcrQueue, 'enqueue'> | null;
}

// ---------- Link codes ----------

export function mintLinkCode(db: Db, userId: number): { code: string; expiresTs: number } {
  const bytes = randomBytes(CODE_LENGTH);
  const code = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  const now = nowSeconds();
  const expiresTs = now + LINK_CODE_TTL_SECONDS;
  // One outstanding code per member: minting a new one invalidates the old.
  db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, userId)).run();
  db.insert(telegramLinkCodes).values({ code, userId, createdTs: now, expiresTs }).run();
  return { code, expiresTs };
}

// ---------- Message handling ----------

const HELP = [
  'I turn whatever you send me into a memo in your reef 🐠',
  '',
  'To connect this chat, open NemoMemo → Settings → Access, tap',
  '"Connect Telegram", and send me the code like this:',
  '',
  '/link ABCD2345',
].join('\n');

function messageText(message: TelegramMessage): string {
  return (message.text ?? message.caption ?? '').trim();
}

/** The largest photo size Telegram offers — the last entry is the biggest. */
function pickFile(message: TelegramMessage): { file: TelegramFile; kind: 'photo' | 'audio' | 'file' } | null {
  if (message.photo?.length) return { file: message.photo[message.photo.length - 1]!, kind: 'photo' };
  if (message.voice) return { file: message.voice, kind: 'audio' };
  if (message.audio) return { file: message.audio, kind: 'audio' };
  if (message.video) return { file: message.video, kind: 'file' };
  if (message.document) return { file: message.document, kind: 'file' };
  return null;
}

async function downloadFile(
  config: Config,
  deps: TelegramDeps,
  file: TelegramFile,
): Promise<{ bytes: Buffer; filename: string; type: string } | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const token = config.telegram!.botToken;
  const meta = await fetchImpl(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(file.file_id)}`,
  );
  if (!meta.ok) return null;
  const json = (await meta.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = json.result?.file_path;
  if (!filePath) return null;
  const download = await fetchImpl(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!download.ok) return null;
  const bytes = Buffer.from(await download.arrayBuffer());
  const filename = file.file_name ?? filePath.split('/').pop() ?? 'telegram-file';
  return { bytes, filename, type: file.mime_type ?? guessType(filename) };
}

function guessType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
  };
  return map[ext] ?? 'application/octet-stream';
}

/**
 * One Telegram message in, one reply out (or null to stay quiet). Everything
 * the bot decides lives here, so the whole feature is testable without any
 * polling or network.
 */
export async function handleTelegramMessage(
  db: Db,
  config: Config,
  deps: TelegramDeps,
  message: TelegramMessage,
): Promise<string | null> {
  if (!config.telegram) return null;
  const chatId = String(message.chat.id);
  const text = messageText(message);
  const link = db.select().from(telegramChats).where(eq(telegramChats.chatId, chatId)).get();

  // ---- Commands that work whether or not the chat is linked ----
  if (text === '/start' || text === '/help') return HELP;

  if (text.startsWith('/link')) {
    const code = text.slice('/link'.length).trim().toUpperCase();
    const now = nowSeconds();
    const row = code
      ? db.select().from(telegramLinkCodes).where(eq(telegramLinkCodes.code, code)).get()
      : undefined;
    if (!row || row.expiresTs <= now) {
      return "That code didn't work — it may have expired. Grab a fresh one in Settings → Access.";
    }
    const user = db.select().from(users).where(eq(users.id, row.userId)).get();
    if (!user || user.rowStatus !== 'NORMAL') {
      return "That code didn't work — it may have expired. Grab a fresh one in Settings → Access.";
    }
    db.$client.transaction(() => {
      // A code is single-use, and a chat belongs to exactly one member.
      db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.code, code)).run();
      db.delete(telegramChats).where(eq(telegramChats.chatId, chatId)).run();
      db.insert(telegramChats).values({ userId: user.id, chatId, createdTs: now }).run();
    })();
    return `Connected to ${user.username}'s reef 🐠 Send me anything and it becomes a memo — #tags work too.`;
  }

  if (text === '/unlink') {
    if (!link) return 'This chat is already disconnected.';
    db.delete(telegramChats).where(eq(telegramChats.chatId, chatId)).run();
    return 'Disconnected — nothing more from this chat will reach your reef. Just keep swimming 🐟';
  }

  // ---- Everything else needs a linked, active member ----
  if (!link) return HELP;
  const user = db.select().from(users).where(eq(users.id, link.userId)).get();
  if (!user || user.rowStatus !== 'NORMAL') return null;

  const media = pickFile(message);
  if (!text && !media) return null;

  let attachmentId: number | null = null;
  if (media) {
    const downloaded = await downloadFile(config, deps, media.file);
    if (!downloaded) return "I couldn't fetch that file from Telegram — try sending it again?";
    const stored = storeAttachment(
      db,
      config,
      {
        creatorId: user.id,
        filename: downloaded.filename,
        type: downloaded.type,
        bytes: downloaded.bytes,
      },
      { ocr: deps.ocr as OcrQueue | null, transcribe: deps.transcribe as OcrQueue | null },
    );
    attachmentId = stored.id;
  }

  const now = nowSeconds();
  const { payload } = buildPayload(text);
  const created = db
    .insert(memos)
    .values({
      uid: newUid(),
      creatorId: user.id,
      content: text,
      visibility: getUserGeneral(db, user.id).defaultVisibility,
      payload,
    })
    .returning()
    .get();
  if (attachmentId != null) {
    db.$client.prepare('UPDATE attachment SET memo_id = ? WHERE id = ?').run(created.id, attachmentId);
  }
  db.update(telegramChats).set({ lastMemoTs: now }).where(eq(telegramChats.id, link.id)).run();

  return media ? 'Saved, with the file 🐠' : 'Saved 🐠';
}

// ---------- The long-polling loop ----------

const OFFSET_SETTING = 'TELEGRAM_OFFSET';

function readOffset(db: Db): number {
  const row = db.$client
    .prepare('SELECT value FROM instance_setting WHERE name = ?')
    .get(OFFSET_SETTING) as { value: string } | undefined;
  return row ? Number(row.value) || 0 : 0;
}

function writeOffset(db: Db, offset: number): void {
  db.$client
    .prepare(
      `INSERT INTO instance_setting (name, value) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
    )
    .run(OFFSET_SETTING, String(offset));
}

export interface TelegramBot {
  stop: () => void;
}

/**
 * Long-polls Telegram and hands each message to handleTelegramMessage. The
 * update offset is persisted, so a restart can't replay messages already
 * turned into memos.
 *
 * Started only from the single-tenant entry point: in cloud mode many reef
 * apps share one process, and several pollers on one bot token would fight
 * over getUpdates.
 */
export function startTelegramBot(db: Db, config: Config, deps: TelegramDeps = {}): TelegramBot {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const token = config.telegram!.botToken;
  let offset = readOffset(db);
  let stopped = false;

  const loop = async (): Promise<void> => {
    while (!stopped) {
      try {
        const response = await fetchImpl(
          `https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${offset}&allowed_updates=["message"]`,
        );
        const json = (await response.json()) as { ok: boolean; result?: TelegramUpdate[] };
        for (const update of json.result ?? []) {
          offset = update.update_id + 1;
          if (update.message) {
            try {
              const reply = await handleTelegramMessage(db, config, deps, update.message);
              if (reply) {
                await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ chat_id: update.message.chat.id, text: reply }),
                });
              }
            } catch (error) {
              // One bad message must never stop the loop (or leak its content).
              console.error('[telegram] failed to handle a message:', (error as Error).message);
            }
          }
          writeOffset(db, offset);
        }
      } catch (error) {
        if (stopped) return;
        console.error('[telegram] poll failed:', (error as Error).message);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  };

  void loop();
  console.log('🤖 Telegram capture bot listening');
  return {
    stop: () => {
      stopped = true;
    },
  };
}
