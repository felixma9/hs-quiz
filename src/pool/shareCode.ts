import { ATTRS, type AttrKey } from '../lib/attributes';
import type { GauntletSettings } from '../modes/gauntlet/settings';

/**
 * A short code holding the card pool (sets, rarities) and the Gauntlet
 * settings, so friends can play with the same setup.
 *
 * Layout, as bits: version (3) | rarities (5) | minions only (1) |
 * Gauntlet fields (8) | sets (one per entry of SHARE_SETS), packed into bytes
 * and written as base64url. A set bit means "switched on".
 *
 * APPEND ONLY: codes refer to sets and fields by position in these lists, so
 * never reorder or remove entries. New sets go on the end; a code made before
 * a set existed leaves that set on.
 */
export const SHARE_SETS = [
  'LEGACY', 'EXPERT1', 'NAXX', 'GVG', 'BRM', 'TGT', 'LOE', 'OG', 'KARA', 'GANGS', 'UNGORO', 'ICECROWN', 'LOOTAPALOOZA',
  'GILNEAS', 'BOOMSDAY', 'TROLL', 'DALARAN', 'ULDUM', 'DRAGONS', 'YEAR_OF_THE_DRAGON', 'DEMON_HUNTER_INITIATE',
  'BLACK_TEMPLE', 'SCHOLOMANCE', 'DARKMOON_FAIRE', 'THE_BARRENS', 'STORMWIND', 'ALTERAC_VALLEY', 'THE_SUNKEN_CITY',
  'REVENDRETH', 'PATH_OF_ARTHAS', 'RETURN_OF_THE_LICH_KING', 'BATTLE_OF_THE_BANDS', 'TITANS', 'WILD_WEST',
  'WHIZBANGS_WORKSHOP', 'WONDERS', 'ISLAND_VACATION', 'SPACE', 'EMERALD_DREAM', 'THE_LOST_CITY', 'TIME_TRAVEL',
  'CATACLYSM', 'ESCAPEFROM_VIOLET_HOLD', 'BE', 'CORE', 'EVENT',
];
const SHARE_RARITIES = ['FREE', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const SHARE_FIELDS: AttrKey[] = ['name', 'class', 'cost', 'attack', 'health', 'rarity', 'tribe', 'text'];
const VERSION = 1;

export interface SharedSetup {
  excludedSets: string[];
  excludedRarities: string[];
  gauntlet: GauntletSettings;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeSetup({ excludedSets, excludedRarities, gauntlet }: SharedSetup): string {
  const bits: number[] = [];
  const push = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };
  push(VERSION, 3);
  for (const r of SHARE_RARITIES) bits.push(excludedRarities.includes(r) ? 0 : 1);
  bits.push(gauntlet.minionsOnly ? 1 : 0);
  for (const f of SHARE_FIELDS) bits.push(gauntlet.allowed.includes(f) ? 1 : 0);
  for (const s of SHARE_SETS) bits.push(excludedSets.includes(s) ? 0 : 1);
  // Six bits per character; trailing "on" sets can be dropped (missing = on).
  while (bits.length % 6) bits.push(1);
  let out = '';
  for (let i = 0; i < bits.length; i += 6) out += B64[parseInt(bits.slice(i, i + 6).join(''), 2)];
  return out.replace(/_+$/, '');
}

/** Read a code (or a share link containing one). Returns null if it isn't valid. */
export function decodeSetup(input: string): SharedSetup | null {
  const code = extractCode(input);
  if (!code || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  const bits: number[] = [];
  for (const ch of code) {
    const v = B64.indexOf(ch);
    for (let i = 5; i >= 0; i--) bits.push((v >> i) & 1);
  }
  let p = 0;
  const take = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | (bits[p++] ?? 1);
    return v;
  };
  if (take(3) !== VERSION) return null;
  const excludedRarities = SHARE_RARITIES.filter(() => take(1) === 0);
  const minionsOnly = take(1) === 1;
  const allowed = SHARE_FIELDS.filter(() => take(1) === 1);
  const excludedSets = SHARE_SETS.filter(() => take(1) === 0);
  if (excludedRarities.length === SHARE_RARITIES.length || excludedSets.length === SHARE_SETS.length || !allowed.length) return null;
  return {
    excludedSets,
    excludedRarities,
    gauntlet: { minionsOnly, allowed: ATTRS.map((a) => a.key).filter((k) => allowed.includes(k)) },
  };
}

/** Accept a bare code, or a link like …/#/?s=CODE. */
function extractCode(input: string): string | null {
  const t = input.trim();
  const m = t.match(/[?&]s=([A-Za-z0-9_-]+)/);
  return m ? m[1] : t || null;
}

/** The code in the current URL, if someone opened a share link. */
export function codeFromLocation(hash = location.hash): string | null {
  return hash.match(/[?&]s=([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

export function shareLink(code: string): string {
  return `${location.origin}${location.pathname}#/?s=${code}`;
}
