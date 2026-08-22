/**
 * Demo seed for the public NemoMemo demo instance.
 *
 * Creates a small, believable reef: an admin, four personas who leave notes for
 * themselves and each other, and a `guest` account (password below) that
 * visitors are invited to sign in with — pre-furnished with private memos, a
 * saved view, and inbox notifications so their Home screen feels lived-in.
 *
 * Run against a fresh database (the nightly demo reset does this) or an
 * existing one (accounts are reused, memos are appended).
 *
 *   NEMOMEMO_URL   base URL of the API (default http://localhost:5230/api/v1)
 *   ADMIN_PASSWORD password for the `reefkeeper` admin. On a FRESH database
 *                  this account is created first so it becomes the admin —
 *                  without it, whichever account signs up first would be.
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

// Admin FIRST so it owns the instance on a fresh database.
let admin = null;
if (process.env.ADMIN_PASSWORD) {
  admin = await user('reefkeeper', process.env.ADMIN_PASSWORD, {
    nickname: 'Reef Keeper',
    description: 'Runs this demo reef. Waters the anemones daily. 🪴',
  });
} else {
  console.warn('ADMIN_PASSWORD not set — skipping the reefkeeper admin account.');
}

const coral = await user('coral', PERSONA_PASSWORD, {
  nickname: 'Coral',
  description: 'Household organizer. If it has a checklist, it was probably me. 🪸',
});
const nemo = await user('nemo', PERSONA_PASSWORD, {
  nickname: 'Nemo',
  description: 'Small fin, big dreams. Learning to code between classes. 🧡',
});
const dory = await user('dory', PERSONA_PASSWORD, {
  nickname: 'Dory',
  description: 'I suffer from short-term memory loss. Heavy Dory-memo user, obviously.',
});
const marlin = await user('marlin', PERSONA_PASSWORD, {
  nickname: 'Marlin',
  description: 'Dad, worrier, homelab tinkerer. Practicing one (1) joke.',
});
const guest = await user('guest', PERSONA_PASSWORD, {
  nickname: 'Demo Visitor',
  description: "That's you! This account belongs to everyone trying the demo. 👋",
});

const mk = async (cookie, content, extra = {}) =>
  (await call(cookie, 'POST', '/memos', { content, visibility: 'PUBLIC', ...extra })).json.memo;
const comment = (cookie, memo, content) =>
  call(cookie, 'POST', `/memos/${memo.uid}/comments`, { content });
const react = (cookie, memo, emoji) =>
  call(cookie, 'POST', `/memos/${memo.uid}/reactions`, { emoji });

// ---------- The pinned welcome (by the admin when available) ----------

const welcome = await mk(admin ?? coral, `# Welcome to the NemoMemo demo! 🪸

This is a live, shared playground — poke everything. It resets to this state every day at 09:00 UTC, so nothing you do here can break anything.

**Want the full experience?** Sign in as \`guest\` / \`justkeepswimming\` — that account has its own notes, a saved view, and an inbox waiting for you. Then try:

- [ ] Write a memo with **Markdown** and a #tag (nested ones like #reef/tour work too)
- [ ] Tick a checkbox right here in the timeline — the memo updates itself
- [ ] Make a **Dory memo** 🐟 (the little fish button) — it forgets itself in 24 hours
- [ ] React to someone's memo, or leave a comment
- [ ] Press **⌘K** and search for "noodle"

Self-host your own reef with one command:

\`\`\`bash
docker run -d -p 5230:5230 -v nemomemo-data:/app/data nemomemo
\`\`\`

Just keep swimming. 🫧`);
await call(admin ?? coral, 'PATCH', `/memos/${welcome.uid}`, { pinned: true });

// ---------- Coral: the household organizer ----------

const grocery = await mk(coral, `Grocery run before Sunday dinner 🛒 #home/groceries

- [x] Kelp noodles
- [x] Sea grapes
- [ ] Nori sheets (the good brand)
- [ ] Dessert — @marlin pick something Nemo actually eats
- [ ] Bubbles for the bubble jar`, { visibility: 'PROTECTED' });

await mk(coral, `Chore rotation this week #home/chores

| Day | Anemone care | Kitchen | Bubble jar |
| --- | --- | --- | --- |
| Mon | Nemo | Coral | Marlin |
| Wed | Marlin | Nemo | Coral |
| Fri | Coral | Marlin | Nemo |

Swap freely, just note it here so nobody double-waters the anemone again. 🙃`, { visibility: 'PROTECTED' });

const noodles = await mk(coral, `## Seaweed noodle bowl (20 min, feeds 4) 🍜 #recipes/dinner

The one everybody keeps asking about.

**You need**
- [ ] Kelp noodles, 2 packs
- [ ] Miso paste, 2 tbsp
- [ ] Sesame oil, ginger, garlic
- [ ] Whatever vegetables are about to go sad in the fridge

**Steps**
1. Whisk miso into 4 cups warm broth — *don't boil it*
2. Sauté ginger + garlic in sesame oil, add vegetables
3. Noodles in last, 3 minutes only
4. Top with sesame seeds and act like it took effort`);

const trip = await mk(coral, `Sydney trip planning 🗺️ #trips/sydney

| When | What | Booked? |
| --- | --- | --- |
| Fri evening | Swim out via the EAC | ✅ |
| Sat morning | Harbor tour, 42 Wallaby Way | ✅ |
| Sat night | Dinner reservation | ❌ |
| Sun | Float home, slowly | — |

- [ ] Travel insurance
- [ ] Tell the school Nemo's out Friday
- [ ] @dory please do NOT lose the itinerary this time 💙`, { visibility: 'PROTECTED' });

await mk(coral, `New here? @guest this reef is yours to play with — you have notes waiting in your account and a bell 🔔 with your name on it. Say hi in the comments somewhere!`, { visibility: 'PROTECTED' });

// ---------- Nemo: student + budding developer ----------

const til = await mk(nemo, `TIL: you can follow docker logs from a specific time 🤯 #dev/til

\`\`\`bash
docker logs --since 30m -f nemomemo
\`\`\`

Also \`--tail 50\` if you just want the recent stuff. Where has this been all my life`);

await mk(nemo, `Biology project notes — bioluminescence #school/biology

> Roughly 76% of deep-sea creatures can produce their own light.

That's most of them?? Sources so far: [NOAA deep sea page](https://oceanexplorer.noaa.gov). Need two more by Thursday.

- [x] Pick topic
- [x] Find first source
- [ ] Outline
- [ ] Stop reading about anglerfish and actually write it`);

await mk(nemo, `Reading log 📚 #reading

Currently: *20,000 Leagues Under the Sea* — chapter 11.

> "The sea is everything. It covers seven tenths of the terrestrial globe."

Honestly? Relatable.`);

const slip = await mk(nemo, `@marlin can you sign my permission slip tonight?? The reef field trip is FRIDAY and Mr. Ray needs it by tomorrow 🙏🙏 It's on the kitchen counter under the bubble jar.`, { visibility: 'PROTECTED' });

// ---------- Dory: the Dory-memo power user ----------

const parking = await mk(dory, `Parked at Level 2, Row F. 🚗

...I'm like 80% sure it was Row F. This is exactly the kind of thing Dory memos are for — by tomorrow it won't matter and it'll be gone. 🐟`, { dory: true });

await mk(dory, `Guest wifi for whoever's visiting today: \`REEF-GUEST\` / \`bubbles123\` — this note forgets itself before it becomes a security problem 🫧`, { visibility: 'PROTECTED', dory: true });

await mk(dory, `Whale language practice, week 3 🐋 #languages/whale

Key learning: it's not about the words, it's about **commitment**. Speak sloooowly. Rooound vowels. Today I successfully asked a humpback for directions and only mildly insulted his mother.`);

await mk(dory, `Things I keep forgetting (a living document) #wisdom

- [ ] Where the drop-off is
- [ ] That I already fed the fish
- [x] P. Sherman, 42 Wallaby Way, Sydney (NAILED IT)
- [ ] What I opened this app to write`);

// ---------- Marlin: work, homelab, and one joke ----------

await mk(marlin, `Standup notes — Tuesday #work/standup

**Yesterday:** shipped the anemone gate fix, reviewed Coral's checklist PR
**Today:** migrating the reef backups to the new NAS
**Blocked:** waiting on the drop-off risk assessment (again)`, { visibility: 'PROTECTED' });

const homelab = await mk(marlin, `Homelab log: moved the reef to its own VM 🖥️ #homelab/proxmox

Finally split services onto a dedicated box. Relevant bits:

\`\`\`bash
qm create 210 --name reef --memory 4096 --cores 2
docker compose up -d --build
\`\`\`

Uptime so far: 6 days. The bottleneck was never the hardware, it was me.`);

await mk(marlin, `Family safety review (updated) #family

1. Never touch the boats
2. The drop-off is not a playground
3. If separated: find the EAC, it flows to Sydney
4. New: the "demo reset" at 09:00 UTC is NOT an earthquake, stop panicking (this one is for me)`, { visibility: 'PROTECTED' });

const joke = await mk(marlin, `Okay. The joke. Final version. #jokes

"...so the sea cucumber looks at the mollusk and says: *with fronds like these, who needs anemones?*"

Delivery notes: pause BEFORE "fronds". Do not laugh at your own setup. Do not explain it afterward.`);

// ---------- Guest: the account visitors sign into ----------

await mk(guest, `My demo scratchpad — things to try ✅ #getting-started

- [x] Sign in as guest
- [x] Read the welcome memo
- [ ] Write my own memo
- [ ] Make a Dory memo and watch the countdown
- [ ] Check the 🔔 inbox (people mentioned you!)
- [ ] Click a #tag to filter the timeline`, { visibility: 'PRIVATE' });

await mk(guest, `Private thought: nobody else can see this one. Visibility is per-memo — this is **Private**, the grocery list is **Protected** (any member), the welcome memo is **Public**. 🔒`, { visibility: 'PRIVATE' });

await mk(guest, `This note will self-destruct in 24 hours ⏳ Watch the little countdown badge up top — and if you decide you want to keep a Dory memo after all, archiving it rescues it from being forgotten.`, { visibility: 'PRIVATE', dory: true });

const hello = await mk(guest, `Hello from a demo visitor 👋 Testing the markdown kitchen sink:

| Works? | Feature |
| --- | --- |
| ✅ | Tables |
| ✅ | \`inline code\` |
| ✅ | Nested #test/tags |

\`\`\`js
const vibe = 'immaculate';
\`\`\``);

// Saved view for the guest account.
await call(guest, 'PATCH', '/users/-/settings', {
  memoViews: [{ id: 'view-recipes', title: '🍜 Recipes', filter: 'tag in ["recipes"]' }],
});

// ---------- Cross-references, comments, reactions, mentions ----------

// Trip memo references the grocery list (shows the Referencing panel).
await call(coral, 'PATCH', `/memos/${trip.uid}`, { relatedMemoUids: [grocery.uid] });

await comment(nemo, welcome, 'Best reef on the internet!! 🧡');
await comment(dory, welcome, 'I love this place. What is this place?');
await comment(guest, welcome, 'Visitor checking in — the checkbox thing in the timeline is really slick.');
await comment(marlin, slip, "Signed and back under the bubble jar. Also WHY is it always last-minute with you 😩❤️");
await comment(marlin, grocery, 'Got the kelp noodles and dessert. You said "something Nemo actually eats" so: bubbles.');
await comment(coral, joke, "It's still not funny, dear. Keep the day job.");
await comment(nemo, til, 'Used this today in class, Mr. Ray was impressed 😎');

await react(nemo, welcome, '🎉');
await react(dory, welcome, '🐠');
await react(marlin, welcome, '👍');
await react(guest, welcome, '💡');
await react(coral, homelab, '🔥');
await react(nemo, homelab, '👏');
await react(dory, noodles, '🎉');
await react(guest, noodles, '💙');
await react(coral, parking, '😂');
await react(guest, joke, '😂');
await react(nemo, hello, '👀');
await react(dory, hello, '🫧');

console.log('Demo reef seeded: 6 accounts, ~22 memos, comments, reactions, mentions, a saved view, and 3 Dory memos. 🐠');
