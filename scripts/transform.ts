import type { Card } from '../src/lib/types';

/** Raw record from HearthstoneJSON (only the fields we read). */
export interface RawCard {
  id: string;
  dbfId: number;
  name: string;
  type: string;
  set: string;
  rarity?: string;
  cardClass?: string;
  classes?: string[];
  cost?: number;
  attack?: number;
  health?: number;
  durability?: number;
  armor?: number;
  races?: string[];
  race?: string;
  spellSchool?: string;
  text?: string;
  flavor?: string;
  countAsCopyOfDbfId?: number;
  collectible?: boolean;
}

const TYPES = new Set(['MINION', 'SPELL', 'WEAPON', 'HERO', 'LOCATION']);
/** Sets that only hold copies of other cards (or skins). */
const EXCLUDED_SETS = new Set(['VANILLA', 'CORE_HIDDEN', 'HERO_SKINS']);
/** Sets that mostly reprint older cards; a copy elsewhere wins. */
const REPRINT_SETS = new Set(['CORE']);

/**
 * Turn card markup into clean text. Keeps <b>/<i> (for drawing the card)
 * unless keepTags is false; grading strips them with plainText().
 */
export function cleanText(raw: string | undefined, keepTags = true): string {
  if (!raw) return '';
  // Cards that change in play list their text variants after '@' ("base@(3 left!)@(Ready!)"),
  // and a few join them with a digit instead ("...(Upgrades each turn!)</i>1Deal ...").
  // Keep the first: the card's text as you first see it.
  let s = raw.split('@')[0].split(/(?<=[)!.>])\d(?=[A-Z<])/)[0];
  s = s.replace(/\|4\(([^,()]*),([^()]*)\)/g, '$2').replace(/\[x\]/gi, '');
  s = keepTags ? s.replace(/<(?!\/?[bi]>)[^>]*>/gi, '').replace(/<(\/?)I>/g, '<$1i>') : s.replace(/<\/?[a-z]+>/gi, '');
  return s
    .replace(/(?<=[a-z])\{\d+\}/g, '')
    .replace(/\$?\{\d+\}/g, 'X')
    .replace(/[$#](\d)/g, '$1')
    .replace(/@/g, '')
    .replace(/~[A-Z].*$/s, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, ' ')
    .replace(/[ _\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,:;!?)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
}

function slim(r: RawCard): Card {
  const c: Card = {
    id: r.id,
    dbfId: r.dbfId,
    name: r.name,
    type: r.type as Card['type'],
    cardClass: r.cardClass ?? 'NEUTRAL',
    cost: r.cost ?? 0,
    rarity: r.rarity ?? 'FREE',
    set: r.set,
  };
  if (r.classes && r.classes.length > 1) c.classes = [...r.classes].sort();
  if (r.attack != null) c.attack = r.attack;
  if (r.health != null) c.health = r.health;
  if (r.durability) c.durability = r.durability;
  if (r.armor != null) c.armor = r.armor;
  const races = r.races ?? (r.race ? [r.race] : undefined);
  if (races && races.length) c.races = [...races].sort();
  if (r.spellSchool) c.spellSchool = r.spellSchool;
  const text = cleanText(r.text);
  if (text) c.text = text;
  const flavor = cleanText(r.flavor, false);
  if (flavor) c.flavor = flavor;
  return c;
}

/** Filter to playable collectible cards and keep one copy of each. */
export function buildCards(raw: RawCard[]): Card[] {
  const keep = raw.filter(
    (r) =>
      r.collectible !== false &&
      TYPES.has(r.type) &&
      !EXCLUDED_SETS.has(r.set) &&
      r.cost != null &&
      !(r.type === 'HERO' && !r.text),
  );
  const byDbf = new Set(keep.map((r) => r.dbfId));
  const groups = new Map<string, RawCard[]>();
  for (const r of keep) {
    if (r.countAsCopyOfDbfId && byDbf.has(r.countAsCopyOfDbfId)) continue;
    const key = `${r.type}|${r.name.toLowerCase()}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const out: Card[] = [];
  for (const g of groups.values()) {
    g.sort(
      (a, b) =>
        Number(REPRINT_SETS.has(a.set)) - Number(REPRINT_SETS.has(b.set)) ||
        a.dbfId - b.dbfId,
    );
    out.push(slim(g[0]));
  }
  out.sort((a, b) => a.dbfId - b.dbfId);
  return out;
}
