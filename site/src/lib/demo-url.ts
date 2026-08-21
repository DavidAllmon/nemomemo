export const REPO_URL = 'https://github.com/DavidAllmon/nemomemo';
/** The project NemoMemo is lovingly modeled on. */
export const MEMOS_URL = 'https://github.com/usememos/memos';

/**
 * A hosted demo only exists when NEXT_PUBLIC_DEMO_URL is set at build time
 * (production deploys). Otherwise the "demo" call-to-action honestly points at
 * GitHub instead. Local dev (`pnpm dev`) can reach the app at :5173.
 */
export const DEMO_LIVE = Boolean(process.env.NEXT_PUBLIC_DEMO_URL);
export const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_URL ?? REPO_URL;
export const DEMO_LABEL = DEMO_LIVE ? 'Try the live demo' : 'Get it on GitHub';
