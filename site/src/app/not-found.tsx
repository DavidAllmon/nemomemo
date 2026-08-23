import Link from 'next/link';
import { NemoMark } from '@/components/nemo-mark';

export const metadata = {
  title: 'This memo swam away',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="reef-deep flex min-h-screen flex-col items-center justify-center bg-ocean-bg px-4 text-center text-ocean-ink">
      <NemoMark bob className="size-16" />
      <h1 className="mt-5 font-display text-3xl font-bold">This memo swam away</h1>
      <p className="mt-2 max-w-sm text-ocean-muted">
        Either the page never existed, or Dory got to it. Just keep swimming.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-ocean-primary px-5 py-2.5 font-bold text-ocean-on-primary transition-opacity hover:opacity-90"
      >
        Back to the reef
      </Link>
    </div>
  );
}
