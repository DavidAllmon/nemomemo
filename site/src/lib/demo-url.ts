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

/**
 * NemoMemo Cloud (the hosted, paid reef) surfaces on the site only when
 * NEXT_PUBLIC_CLOUD_URL is set at build time — the same ship-dark rule the
 * cloud server code follows behind NEMOMEMO_CLOUD.
 */
export const CLOUD_LIVE = Boolean(process.env.NEXT_PUBLIC_CLOUD_URL);
export const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL ?? '/pricing';
export const SUPPORT_URL = `${REPO_URL}/discussions`;
