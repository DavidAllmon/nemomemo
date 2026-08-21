import { NemoLogo, Wordmark } from '@/components/NemoLogo.js';

export function AboutPage({ version }: { version?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <NemoLogo bob className="size-20" />
      <Wordmark className="text-3xl" />
      <p className="max-w-md text-muted-foreground">
        A cute, self-hosted memo timeline. Write it down, tag it, share it — and when a thought only
        needs to live for a day, give it to Dory. She'll forget it in 24 hours. 🐟
      </p>
      <p className="text-xs text-muted-foreground">
        Version {version ?? '0.1.0'} · Inspired by the excellent open-source{' '}
        <a href="https://usememos.com" target="_blank" rel="noreferrer" className="text-ocean underline">
          Memos
        </a>{' '}
        project · Just keep swimming.
      </p>
    </div>
  );
}
