/**
 * Demo seed for the public NemoMemo demo instance.
 *
 * Builds a believable small reef where every feature is in genuine use:
 * notes-to-self and notes for each other, shared checklists, mentions and
 * inbox activity, comment threads, reactions, pinned + archived memos, photo /
 * audio / document attachments, memo references, a saved view, an active share
 * link, and live Dory memos. Content is written to read like real people's
 * notes — never like demo copy.
 *
 * Run against a fresh database (the nightly demo reset does this) or an
 * existing one (accounts are reused, memos are appended).
 *
 *   NEMOMEMO_URL   base URL of the API (default http://localhost:5230/api/v1)
 *   ADMIN_PASSWORD password for the `reefkeeper` admin. On a FRESH database
 *                  this account is created first so it becomes the admin.
 */
const BASE = process.env.NEMOMEMO_URL ?? 'http://localhost:5230/api/v1';
const PERSONA_PASSWORD = 'justkeepswimming';

async function call(cookie, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return { json: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

async function user(username, password, profile) {
  let cookie;
  try {
    cookie = (await call(null, 'POST', '/auth/signin', { username, password })).cookie;
  } catch {
    cookie = (await call(null, 'POST', '/auth/signup', { username, password })).cookie;
  }
  if (profile) await call(cookie, 'PATCH', '/users/-/account', profile);
  return cookie;
}

const mk = async (cookie, content, extra = {}) =>
  (await call(cookie, 'POST', '/memos', { content, visibility: 'PUBLIC', ...extra })).json.memo;
const comment = (cookie, memo, content) =>
  call(cookie, 'POST', `/memos/${memo.uid}/comments`, { content });
const react = (cookie, memo, emoji) =>
  call(cookie, 'POST', `/memos/${memo.uid}/reactions`, { emoji });
const archive = (cookie, memo) =>
  call(cookie, 'PATCH', `/memos/${memo.uid}`, { rowStatus: 'ARCHIVED' });

// ---------- Attachment helpers ----------

async function upload(cookie, filename, mime, bytes) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  const res = await fetch(`${BASE}/attachments`, { method: 'POST', headers: { cookie }, body: form });
  if (!res.ok) throw new Error(`upload ${filename} -> ${res.status}`);
  return (await res.json()).attachment;
}

/** Deterministic real-looking photos; returns null (and we skip) if offline. */
async function photo(seed) {
  try {
    const res = await fetch(`https://picsum.photos/seed/${seed}/900/600.jpg`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Two seconds of 8-bit mono WAV with a low warbling tone. Whale-adjacent. */
function whaleWav() {
  const rate = 8000;
  const n = rate * 2;
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const wobble = 90 + 50 * Math.sin(2 * Math.PI * 0.7 * t);
    const envelope = Math.sin((Math.PI * i) / n);
    buf[44 + i] = 128 + Math.round(45 * envelope * Math.sin(2 * Math.PI * wobble * t));
  }
  return buf;
}

// ---------- Accounts (admin FIRST so it owns a fresh instance) ----------

let admin = null;
if (process.env.ADMIN_PASSWORD) {
  admin = await user('reefkeeper', process.env.ADMIN_PASSWORD, {
    nickname: 'Reef Keeper',
    description: 'Keeper of this reef. Waters the anemones, restarts the servers. 🪴',
  });
} else {
  console.warn('ADMIN_PASSWORD not set — skipping the reefkeeper admin account.');
}

const coral = await user('coral', PERSONA_PASSWORD, {
  nickname: 'Coral',
  description: 'If it has a checklist, it was probably me. 🪸',
});
const nemo = await user('nemo', PERSONA_PASSWORD, {
  nickname: 'Nemo',
  description: 'Small fin, big dreams. Learning to code between classes. 🧡',
});
const dory = await user('dory', PERSONA_PASSWORD, {
  nickname: 'Dory',
  description: 'Short-term memory loss. Long-term optimism.',
});
const marlin = await user('marlin', PERSONA_PASSWORD, {
  nickname: 'Marlin',
  description: 'Dad. Worrier. Homelab tinkerer. One (1) joke.',
});
const pearl = await user('demo', PERSONA_PASSWORD, {
  nickname: 'Pearl',
  description: 'Shared account for reef visitors — make yourself at home. 🫧',
});

// ---------- The pinned welcome (an admin announcement, not ad copy) ----------

const welcome = await mk(admin ?? coral, `# Welcome to the reef 🪸

This is our shared, public NemoMemo instance. A few house rules from your keeper:

- Everything here **resets daily at 09:00 UTC** — write freely, nothing is precious
- Visitors: sign in as \`demo\` / \`justkeepswimming\` to post, react, and comment
- Keep it kind. Fish are friends.

New here? Click a #tag, tick someone's checkbox, press **⌘K** to search, and try the little 🐟 button in the editor — that's a Dory memo, and she *will* forget it in 24 hours.`);
await call(admin ?? coral, 'PATCH', `/memos/${welcome.uid}`, { pinned: true });

// ---------- Coral: household ops ----------

const grocery = await mk(coral, `Grocery run before Sunday dinner 🛒 #home/groceries

- [x] Kelp noodles
- [x] Sea grapes
- [ ] Nori sheets (the good brand, not the sad ones)
- [ ] Dessert — @marlin pick something Nemo actually eats
- [ ] Bubbles for the bubble jar`, { visibility: 'PROTECTED' });

await mk(coral, `Chore rotation this week #home/chores

| Day | Anemone care | Kitchen | Bubble jar |
| --- | --- | --- | --- |
| Mon | Nemo | Coral | Marlin |
| Wed | Marlin | Nemo | Coral |
| Fri | Coral | Marlin | Nemo |

Swap freely, just note it here. Nobody double-waters the anemone again. 🙃`, { visibility: 'PROTECTED' });

const noodlePhoto = await photo('noodle-bowl');
const noodleAttachment = noodlePhoto
  ? await upload(coral, 'sunday-noodles.jpg', 'image/jpeg', noodlePhoto)
  : null;
const noodles = await mk(coral, `## Seaweed noodle bowl (20 min, feeds 4) 🍜 #recipes/dinner

The one everybody keeps asking about. Finally writing it down.

**You need**
- [ ] Kelp noodles, 2 packs
- [ ] Miso paste, 2 tbsp
- [ ] Sesame oil, ginger, garlic
- [ ] Whatever vegetables are about to go sad in the fridge

**Steps**
1. Whisk miso into 4 cups warm broth — *don't boil it*
2. Sauté ginger + garlic in sesame oil, add vegetables
3. Noodles in last, 3 minutes only
4. Sesame seeds on top. Accept compliments gracefully.`, {
  attachmentUids: noodleAttachment ? [noodleAttachment.uid] : undefined,
});

const tripPhoto = await photo('sydney-harbor');
const tripAttachment = tripPhoto
  ? await upload(coral, 'harbor-view.jpg', 'image/jpeg', tripPhoto)
  : null;
const trip = await mk(coral, `Sydney trip 🗺️ #trips/sydney

| When | What | Booked? |
| --- | --- | --- |
| Fri evening | Swim out via the EAC | ✅ |
| Sat morning | Harbor tour | ✅ |
| Sat night | Dinner — somewhere with a view | ❌ |
| Sun | Float home, slowly | — |

- [ ] Travel insurance
- [ ] Tell the school Nemo's out Friday
- [ ] @dory you're in charge of exactly one thing: the itinerary. One thing. 💙`, {
  visibility: 'PROTECTED',
  attachmentUids: tripAttachment ? [tripAttachment.uid] : undefined,
});
await call(coral, 'PATCH', `/memos/${trip.uid}`, { relatedMemoUids: [grocery.uid] });

await mk(coral, `@demo saw you swim in — welcome! The recipes tag is where the good stuff lives, and check your bell 🔔, this should land there.`, { visibility: 'PROTECTED' });

// Finished project, tucked away: the archive isn't empty in real life.
const birthday = await mk(coral, `Nemo's birthday party — planning 🎂 #home/parties

- [x] Book the touch tank room
- [x] Cake (chocolate, NOT carrot, we learned our lesson)
- [x] Invites out by the 3rd
- [x] Goodie bags
- [x] Recovery nap

Went perfectly. Filing this away.`, { visibility: 'PROTECTED' });
await archive(coral, birthday);

// ---------- Nemo: school + learning to code ----------

const til = await mk(nemo, `TIL you can follow docker logs from a specific time 🤯 #dev/til

\`\`\`bash
docker logs --since 30m -f nemomemo
\`\`\`

Also \`--tail 50\` if you just want the recent stuff. Where has this been all my life`);

await mk(nemo, `Biology project notes — bioluminescence #school/biology

> Roughly 76% of deep-sea creatures can produce their own light.

That's MOST of them?? Sources so far: [NOAA ocean exploration](https://oceanexplorer.noaa.gov). Need two more by Thursday.

- [x] Pick topic
- [x] First source
- [ ] Outline
- [ ] Stop reading about anglerfish and actually write it`);

await mk(nemo, `Reading log 📚 #reading

*20,000 Leagues Under the Sea* — chapter 11.

> "The sea is everything. It covers seven tenths of the terrestrial globe."

Honestly? Relatable.`);

const slip = await mk(nemo, `@marlin can you sign my permission slip tonight?? Reef field trip is FRIDAY and Mr. Ray needs it by tomorrow 🙏🙏 It's on the kitchen counter under the bubble jar.`, { visibility: 'PROTECTED' });

const oldSchedule = await mk(nemo, `Class schedule — spring term #school

| Period | Class |
| --- | --- |
| 1 | Currents & Tides |
| 2 | Anemone Safety |
| 3 | Math |
| 4 | Whale (elective) |`, { visibility: 'PRIVATE' });
await archive(nemo, oldSchedule);

// ---------- Dory: heavy Dory-memo user, obviously ----------

const parking = await mk(dory, `Parked at Level 2, Row F 🚗

...I'm like 80% sure it was Row F. Anyway, future me: this note deletes itself tomorrow, so if you're reading this today — LEVEL 2. Probably Row F.`, { dory: true });

await mk(dory, `Guest wifi for whoever's over today: \`REEF-GUEST\` / \`bubbles123\` — gone by tomorrow, as it should be 🫧`, { visibility: 'PROTECTED', dory: true });

const whaleAudio = await upload(dory, 'whale-practice-take3.wav', 'audio/wav', whaleWav());
const whale = await mk(dory, `Whale practice, week 3 🐋 #languages/whale

Attached: take three. Be honest but be gentle. I think my vowels are getting rounder?

Key learning so far: it's not about the words, it's about **commitment**. Speak sloooowly. Today I asked a humpback for directions and only mildly insulted his mother.`, {
  attachmentUids: [whaleAudio.uid],
});

await mk(dory, `Things I keep forgetting (a living document) #wisdom

- [ ] Where the drop-off is
- [ ] That I already fed the fish
- [x] P. Sherman, 42 Wallaby Way, Sydney (NAILED IT)
- [ ] What I opened this app to write`);

// ---------- Marlin: work + homelab ----------

await mk(marlin, `Standup — Tuesday #work/standup

**Yesterday:** shipped the anemone gate fix, reviewed Coral's checklist PR
**Today:** migrating reef backups to the new NAS
**Blocked:** still waiting on the drop-off risk assessment. Week two. Not stressed. Fine.`, { visibility: 'PROTECTED' });

const rackPhoto = await photo('server-rack');
const rackAttachment = rackPhoto
  ? await upload(marlin, 'the-rack.jpg', 'image/jpeg', rackPhoto)
  : null;
const homelab = await mk(marlin, `Homelab log: reef services get their own VM 🖥️ #homelab/proxmox

Finally split everything onto a dedicated box. The relevant incantations:

\`\`\`bash
qm create 210 --name reef --memory 4096 --cores 2
docker compose up -d --build
\`\`\`

Six days uptime. The bottleneck was never the hardware, it was me.`, {
  attachmentUids: rackAttachment ? [rackAttachment.uid] : undefined,
});

await mk(marlin, `Family safety review (updated) #family

1. Never touch the boats
2. The drop-off is not a playground
3. If separated: find the EAC, it flows to Sydney
4. New: the 09:00 UTC "reset" is NOT an earthquake. Stop panicking. (This one is for me.)`, { visibility: 'PROTECTED' });

const joke = await mk(marlin, `The joke. Final version. #jokes

"...so the sea cucumber looks over at the mollusk and says: *with fronds like these, who needs anemones?*"

Delivery notes: pause BEFORE "fronds". Do not laugh at your own setup. Do not explain it afterward.`);

const oldBackup = await mk(marlin, `Backup runbook v1 (superseded by the NAS setup) #homelab

\`\`\`bash
rsync -av /reef/data backup@oldbox:/backups/
\`\`\`

Keeping for reference, but v2 lives on the new box now.`, { visibility: 'PRIVATE' });
await archive(marlin, oldBackup);

// ---------- Pearl (the shared `demo` account) ----------

await mk(pearl, `Gift ideas for Coral's birthday 🤫 #gifts

- [ ] That ceramic planter she kept circling back to
- [x] Ask Marlin to split the big one
- [ ] Card — funny, not sappy, she'll check
- [ ] Do NOT tell Dory (she means well, she cannot hold a secret)`, { visibility: 'PRIVATE' });

await mk(pearl, `Quiet morning. Coffee, tide charts, no plans until noon — the kind of day you don't notice is perfect until later. Writing it down so I do. #journal`, { visibility: 'PRIVATE' });

await mk(pearl, `Dry cleaning ticket #4482, ready after 3pm Thursday. Counter closes at 6. ⏳`, { visibility: 'PRIVATE', dory: true });

const tidepoolPhoto = await photo('tidepool');
const packingDoc = Buffer.from(
  `Tidepool weekend — packing
==========================
- wetsuit (the patched one is FINE)
- tide chart, printed, because phones drown
- thermos
- the good snacks, hidden from Dory
- first-aid kit
- headlamp for the night walk
`,
  'utf8',
);
const tidepoolAttachment = tidepoolPhoto
  ? await upload(pearl, 'tidepools.jpg', 'image/jpeg', tidepoolPhoto)
  : null;
const packingAttachment = await upload(pearl, 'packing-list.txt', 'text/plain', packingDoc);
const tidepool = await mk(pearl, `Tidepool weekend is ON 🌊 #trips/tidepools

Low tide hits 6:40am Saturday, which is a crime, but the pools at dawn are worth it. Packing list attached for whoever's coming — shout if I forgot anything.`, {
  attachmentUids: [tidepoolAttachment?.uid, packingAttachment.uid].filter(Boolean),
});

// Finished business, filed away — so the Archived page has life in it.
const apartment = await mk(pearl, `Apartment hunt — CLOSED 🎉 #home/apartment

- [x] Shortlist (got to 11, absurd)
- [x] Viewings x6
- [x] Application + references
- [x] Sign lease
- [x] Change address everywhere (the DMV counts as cardio)

Keys in hand. Never again. Until next time.`, { visibility: 'PRIVATE' });
await archive(pearl, apartment);

const oldReading = await mk(pearl, `Summer reading list (finished) #reading

- [x] *The Soul of an Octopus*
- [x] *20,000 Leagues* (lent my copy to Nemo)
- [x] *Why Fish Don't Exist*

Best of the three: the octopus one, not close.`, { visibility: 'PRIVATE' });
await archive(pearl, oldReading);

// An active share link, the way you'd actually send a memo to someone outside.
await call(pearl, 'POST', `/memos/${tidepool.uid}/shares`, { expiresIn: '30d' });

await call(pearl, 'PATCH', '/users/-/settings', {
  memoViews: [{ id: 'view-recipes', title: '🍜 Recipes', filter: 'tag in ["recipes"]' }],
});

// ---------- Conversations ----------

await comment(nemo, welcome, 'Best reef on the internet 🧡');
await comment(dory, welcome, 'I love it here. Where is here?');
await comment(marlin, grocery, 'Kelp noodles and dessert: acquired. You said "something Nemo actually eats," so I got bubbles.');
await comment(coral, grocery, 'That is not dessert, dear.');
await comment(marlin, slip, 'Signed and back under the bubble jar. Also WHY is it always the night before with you 😩❤️');
await comment(nemo, slip, 'thank youuuu 🙏');
await comment(nemo, noodles, 'Can we have this again tomorrow. And the day after.');
await comment(pearl, noodles, 'Made this last night with rice noodles instead — still incredible.');
await comment(dory, trip, 'Itinerary. One thing. I have written it on my fin.');
await comment(coral, joke, "It's still not funny, dear. Keep the day job.");
await comment(pearl, joke, 'I laughed. Once. At the delivery notes, not the joke.');
await comment(nemo, til, 'Used this in class today, Mr. Ray was impressed 😎');
await comment(coral, homelab, 'Six days of uptime and you framed a photo of it. I married a lighthouse keeper.');
await comment(nemo, whale, 'take 3 is definitely rounder than take 2!!');
await comment(marlin, tidepool, "6:40am. On a SATURDAY. ...fine, I'm in. I'll bring the thermos.");
await comment(dory, tidepool, 'I will bring the snacks I was specifically told not to find.');

await react(nemo, welcome, '🎉');
await react(dory, welcome, '🐠');
await react(marlin, welcome, '👍');
await react(pearl, welcome, '💙');
await react(coral, homelab, '🔥');
await react(nemo, homelab, '👏');
await react(dory, noodles, '🎉');
await react(pearl, noodles, '💙');
await react(marlin, noodles, '👍');
await react(coral, parking, '😂');
await react(pearl, joke, '😂');
await react(nemo, tidepool, '🎉');
await react(dory, tidepool, '🫧');
await react(coral, tidepool, '💙');
await react(pearl, whale, '👏');

console.log(
  'Reef seeded: 6 accounts, ~24 memos (3 archived, 3 Dory), photo/audio/document attachments, 16 comments, reactions, mentions, a saved view, and an active share link. 🐠',
);
