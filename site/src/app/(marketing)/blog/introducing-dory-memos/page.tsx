import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Introducing Dory memos' };

export default function Post() {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-14">
      <p className="text-xs font-bold text-ocean-muted">August 21, 2026</p>
      <h1 className="mt-1 font-display text-3xl font-bold">
        Introducing Dory memos: notes that forget themselves
      </h1>
      <div className="mt-6 flex flex-col gap-4 leading-relaxed text-ocean-ink">
        <p>
          Every notes app is a machine for remembering. That&apos;s the whole pitch — capture
          everything, keep it forever, search it later. But look honestly at your notes and you&apos;ll
          find another species entirely: the parking spot, the confirmation code, the &ldquo;call the
          dentist before 5.&rdquo; Notes that matter intensely for a day and then become sediment.
        </p>
        <p>
          You never delete them, because deleting is work. So they pile up, and every search wades
          through a decade of expired parking spots.
        </p>
        <p>
          <strong>Dory memos</strong> are our answer. When a thought only needs to live a day, tap the
          little blue tang in the editor. The memo gets a friendly countdown badge — &ldquo;forgets in
          23h&rdquo; — fades gently over its final hours, and at the 24-hour mark the server deletes
          it. Actually deletes it: comments, attachments, and share links go too.
        </p>
        <p>A few rules keep it honest:</p>
        <ul className="list-disc pl-6">
          <li>
            <strong>Pinning and Dory are mutually exclusive.</strong> Pinned means forever; Dory means
            a day. A memo can&apos;t be both, and the app will gently tell you so.
          </li>
          <li>
            <strong>Archiving rescues.</strong> Changed your mind? Archive the memo and it&apos;s saved
            from Dory&apos;s memory permanently.
          </li>
          <li>
            <strong>No takebacks after zero.</strong> When she forgets, she forgets. That&apos;s the
            point.
          </li>
        </ul>
        <p>
          It turns out deliberate forgetting is a feature remembering apps forgot to build. Just keep
          swimming. 🫧
        </p>
      </div>
    </article>
  );
}
