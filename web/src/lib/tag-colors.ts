import type { TagColor } from '@nemomemo/shared';

/**
 * Class maps for the tag palette. Static strings on purpose — Tailwind only
 * ships classes it can see at build time, so no template interpolation here.
 * `ocean` is also the default for uncolored tags.
 */
const CHIP_CLASSES: Record<TagColor, string> = {
  ocean: 'bg-ocean-soft !text-ocean',
  coral: 'bg-tag-coral-soft !text-tag-coral',
  kelp: 'bg-tag-kelp-soft !text-tag-kelp',
  sand: 'bg-tag-sand-soft !text-tag-sand',
  dory: 'bg-dory-soft !text-dory',
  anemone: 'bg-tag-anemone-soft !text-tag-anemone',
  urchin: 'bg-tag-urchin-soft !text-tag-urchin',
  teal: 'bg-tag-teal-soft !text-tag-teal',
};

const GLYPH_CLASSES: Record<TagColor, string> = {
  ocean: 'text-ocean',
  coral: 'text-tag-coral',
  kelp: 'text-tag-kelp',
  sand: 'text-tag-sand',
  dory: 'text-dory',
  anemone: 'text-tag-anemone',
  urchin: 'text-tag-urchin',
  teal: 'text-tag-teal',
};

/** Solid swatch backgrounds for the Settings color picker dots. */
export const SWATCH_CLASSES: Record<TagColor, string> = {
  ocean: 'bg-ocean',
  coral: 'bg-tag-coral',
  kelp: 'bg-tag-kelp',
  sand: 'bg-tag-sand',
  dory: 'bg-dory',
  anemone: 'bg-tag-anemone',
  urchin: 'bg-tag-urchin',
  teal: 'bg-tag-teal',
};

export function tagChipClass(color: TagColor | undefined): string {
  return CHIP_CLASSES[color ?? 'ocean'];
}

export function tagGlyphClass(color: TagColor | undefined): string {
  return GLYPH_CLASSES[color ?? 'ocean'];
}
