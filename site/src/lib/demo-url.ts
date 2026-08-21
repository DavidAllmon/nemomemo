/**
 * Where "Try the live demo" points — a running NemoMemo app.
 * Local dev serves the app at :5173 (`pnpm dev`); a self-hosted production
 * container serves it at :5230. Set NEXT_PUBLIC_DEMO_URL when deploying.
 */
export const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_URL ?? 'http://localhost:5173';
/** The project NemoMemo is lovingly modeled on. */
export const MEMOS_URL = 'https://github.com/usememos/memos';
