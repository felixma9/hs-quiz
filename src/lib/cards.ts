import type { Card } from './types';
import { ATTRS, enumOptions, type AttrKey } from './attributes';

export async function loadCards(): Promise<Card[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}cards.json`);
  if (!res.ok) throw new Error(`Could not load cards (${res.status})`);
  return res.json();
}

/** Cards by id, built once per card list and shared by everything that looks cards up. */
const indexes = new WeakMap<Card[], Map<string, Card>>();
export function cardsById(cards: Card[]): Map<string, Card> {
  let m = indexes.get(cards);
  if (!m) indexes.set(cards, (m = new Map(cards.map((c) => [c.id, c]))));
  return m;
}

/** The id the art host files a card's art under. A few Legacy reprints (LEG_) have none of their own; the original's art is the same. */
const artId = (c: Card) => (c.id.startsWith('LEG_') ? c.id.slice(4) : c.id);
/** A card's art: 512px for drawing the card, 256px for icons and miniatures. */
export const artUrl = (c: Card, size: 256 | 512 = 512) => `https://art.hearthstonejson.com/v1/${size}x/${artId(c)}.jpg`;

/** Small seeded PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Local date as YYYY-MM-DD. */
export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function cardOfTheDay(cards: Card[], date: string): Card {
  const rng = mulberry32(hashString(`hs-quiz:${date}`));
  return cards[Math.floor(rng() * cards.length)];
}

export function randomCard(cards: Card[], rng = Math.random): Card {
  return cards[Math.floor(rng() * cards.length)];
}

/** Pick one attribute Gauntlet can hide on this card, weighted. */
export function pickHidden(card: Card, allowed: AttrKey[], rng = Math.random): AttrKey | null {
  const opts = ATTRS.filter((a) => allowed.includes(a.key) && a.hideable(card));
  const total = opts.reduce((s, a) => s + a.weight, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const a of opts) {
    r -= a.weight;
    if (r <= 0) return a.key;
  }
  return opts[opts.length - 1].key;
}

/**
 * Fields with only one possible answer among cards of the same type in the
 * pool (e.g. rarity when only Legendaries are in play). Asking them would be free.
 */
export function giveaways(pool: Card[]): Set<string> {
  const out = new Set<string>();
  const types = new Set(pool.map((c) => c.type));
  for (const t of types) {
    const same = pool.filter((c) => c.type === t);
    for (const a of ATTRS) {
      if (a.kind === 'enum' && enumOptions(a.key, same).length < 2) out.add(`${t}:${a.key}`);
    }
  }
  return out;
}
