import type { Metadata } from 'next';

/** Canonical origin for the marketing site (apex; www serves too but canonicals point here). */
export const SITE_URL = 'https://trynemomemo.com';
export const SITE_NAME = 'NemoMemo';

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path === '/' ? '' : path}` || SITE_URL;
}

/**
 * The social share card. Declared explicitly on every page-level `openGraph`
 * because Next replaces (not merges) a parent segment's openGraph object —
 * without this, per-page metadata would drop the root og:image.
 */
export const OG_IMAGE = {
  url: '/opengraph-image.png',
  width: 1200,
  height: 630,
  alt: 'NemoMemo — the self-hosted notes app with Dory memos that forget themselves in 24 hours.',
};

/**
 * Per-page metadata with the SEO plumbing every marketing page needs: a real
 * description, a self-referencing canonical (the site is reachable on both the
 * apex and www hosts, and with/without trailing slashes), and matching
 * OpenGraph fields. `title` is the bare page title — the root layout template
 * appends "· NemoMemo".
 */
export function pageMeta({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      images: [OG_IMAGE],
    },
  };
}
