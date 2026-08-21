import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Why we made a notes app cute' };

export default function Post() {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-14">
      <p className="text-xs font-bold text-ocean-muted">August 21, 2026</p>
      <h1 className="mt-1 font-display text-3xl font-bold">Why we made a notes app cute</h1>
      <div className="mt-6 flex flex-col gap-4 leading-relaxed text-ocean-ink">
        <p>
          Self-hosted software has a look: gray dashboards, system fonts, the visual warmth of a
          server rack. It signals seriousness. It also signals <em>chore</em> — and a notes app you
          open reluctantly is a notes app you stop opening.
        </p>
        <p>
          NemoMemo bets the other way. Clownfish orange. Rounded corners. A fish that bobs when your
          timeline is empty and bubbles that rise when you save. Empty states that say &ldquo;just
          keep swimming&rdquo; instead of &ldquo;no data found.&rdquo;
        </p>
        <p>
          None of it costs capability. Underneath the reef is the same serious machinery you&apos;d
          demand from any tool that holds your thoughts: a real filter language, per-memo visibility,
          a proper access-control model, one SQLite file you can back up with <code>cp</code>.
        </p>
        <p>
          Delight isn&apos;t decoration. It&apos;s the difference between software you maintain and
          software you visit. We built the kind you visit. 🐠
        </p>
      </div>
    </article>
  );
}
