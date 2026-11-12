/**
 * npm run history: build public/card-history.json, how each card in
 * cards.json changed across every game patch.
 *
 * Builds and their patch numbers/dates come from the tags of HearthSim's
 * hsdata repo (one tag per game build, "Update to patch 37.0.2.256589").
 * Each build's card list comes from HearthstoneJSON and is cached in
 * scripts/.history-cache/, so later runs only download new builds.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Card } from '../src/lib/types';
import type { RawCard } from './transform';
import { historyOf, toCard, type HistoryFile } from './history';

const CACHE = new URL('./.history-cache/', import.meta.url);
const HSDATA = new URL('./.history-cache/hsdata.git', import.meta.url);
const OUT = new URL('../public/card-history.json', import.meta.url);
const cards: Card[] = JSON.parse(readFileSync(new URL('../public/cards.json', import.meta.url), 'utf8'));
mkdirSync(CACHE, { recursive: true });

interface Build { build: number; patch: string; date: string }
/** The public release (2014-03-11). History starts here. */
const LAUNCH = 4944;

/** Every game build, oldest first, from hsdata's tags (a clone with no file contents: tags and messages only). */
function listBuilds(): Build[] {
  const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (!existsSync(HSDATA)) git('clone', '--quiet', '--bare', '--filter=tree:0', 'https://github.com/HearthSim/hsdata.git', HSDATA.pathname);
  else git('--git-dir', HSDATA.pathname, 'fetch', '--quiet', '--tags', '--filter=tree:0', 'origin');
  const out: Build[] = [];
  for (const line of git('--git-dir', HSDATA.pathname, 'for-each-ref', 'refs/tags', '--format=%(refname:short)\t%(*committerdate:short)%(committerdate:short)\t%(*subject)%(subject)').trim().split('\n')) {
    const [tag, date, subject] = line.split('\t');
    if (!/^\d+$/.test(tag)) continue;
    const build = +tag;
    // Beta builds: cards changed constantly before release, and none of it was ever live.
    if (build < LAUNCH) continue;
    const m = subject.match(/(\d+\.\d+\.\d+)\.\d+/);
    let patch = m ? m[1] : `build ${tag}`;
    // Every 2014 patch after launch is also numbered 1.0.0; the build number tells them apart.
    if (patch === '1.0.0' && build !== LAUNCH) patch = `1.0.0.${build}`;
    out.push({ build, patch, date });
  }
  return out.sort((a, b) => a.build - b.build);
}

/** One build's collectible cards (cached). null if HearthstoneJSON doesn't have it. */
async function buildCards(build: number): Promise<RawCard[] | null> {
  const file = new URL(`${build}.json`, CACHE);
  if (existsSync(file)) {
    const s = readFileSync(file, 'utf8');
    return s === 'missing' ? null : JSON.parse(s);
  }
  const res = await fetch(`https://api.hearthstonejson.com/v1/${build}/enUS/cards.collectible.json`);
  if (res.status === 404) {
    writeFileSync(file, 'missing');
    return null;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for build ${build}`);
  const s = await res.text();
  writeFileSync(file, s);
  return JSON.parse(s);
}

const builds = listBuilds();
console.log(`${builds.length} builds, ${builds[0].patch} (${builds[0].date}) to ${builds.at(-1)!.patch} (${builds.at(-1)!.date})`);

// Download (4 at a time), then walk the builds oldest first.
const lists: (RawCard[] | null)[] = new Array(builds.length);
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < builds.length) {
      const i = next++;
      lists[i] = await buildCards(builds[i].build);
      if (++done % 25 === 0) console.log(`  ${done}/${builds.length} builds`);
    }
  }),
);

const want = new Set(cards.map((c) => c.id));
const versions = new Map<string, { patch: string; card: Card }[]>();
const dates: Record<string, string> = {};
let missing = 0;
for (const [i, list] of lists.entries()) {
  if (!list) {
    missing++;
    continue;
  }
  const { patch, date } = builds[i];
  for (const r of list) {
    if (!want.has(r.id)) continue;
    const card = toCard(r);
    const v = versions.get(r.id) ?? [];
    if (!v.length || JSON.stringify(v.at(-1)!.card) !== JSON.stringify(card)) v.push({ patch, card });
    versions.set(r.id, v);
  }
  dates[patch] ??= date;
}

const out: HistoryFile = { built: new Date().toISOString().slice(0, 10), latest: builds.at(-1)!.patch, dates: {}, cards: {} };
for (const c of cards) {
  const v = versions.get(c.id);
  // Not in any build's list (shouldn't happen): its history is unknown, so it gets none.
  if (!v) continue;
  // The newest version is cards.json itself (it may be a build or two newer than hsdata's tags).
  v.push({ patch: out.latest, card: c });
  const changes = historyOf(v);
  if (!changes.length) continue;
  out.cards[c.id] = changes;
  for (const [patch] of changes) out.dates[patch] = dates[patch];
}
out.dates = Object.fromEntries(Object.entries(out.dates).sort(([, a], [, b]) => a.localeCompare(b)));

const json = JSON.stringify(out);
writeFileSync(OUT, json);
const total = Object.values(out.cards).reduce((n, ch) => n + ch.length, 0);
console.log(
  `${cards.length} cards, ${Object.keys(out.cards).length} changed, ${total} changes; ` +
    `${(json.length / 1024).toFixed(0)} KB (${missing} builds missing from HearthstoneJSON)`,
);
