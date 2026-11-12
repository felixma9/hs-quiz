import type { Card } from './types';
import { plainText, pretty } from './attributes';
import { SETS } from '../data/sets';

/**
 * Card history (public/card-history.json, built by `npm run history`).
 *
 * Only cards that changed are listed. Each card id maps to its changes, newest
 * first, as [patch, was]: "in this patch the card changed; before it, these
 * fields were `was`" (null = the field wasn't there). Applying each `was` to
 * the current card in turn gives every older version.
 */
export type Change = [patch: string, was: Partial<Card>];
export interface HistoryFile {
  built: string;
  latest: string;
  /** Release date (YYYY-MM-DD) of each patch that changed or released a listed card. */
  dates: Record<string, string>;
  cards: Record<string, Change[]>;
  /** The patch each listed card came out in (its timeline starts there). */
  released?: Record<string, string>;
}

let file: Promise<HistoryFile | null> | null = null;
/** Loaded on first use (only CardDB's card view needs it), then shared. */
export function loadHistory(): Promise<HistoryFile | null> {
  file ??= fetch(`${import.meta.env.BASE_URL}card-history.json`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return file;
}

/** The card as it was `steps` changes ago (0 = now). */
export function versionAt(current: Card, changes: Change[], steps: number): Card {
  const c: Record<string, unknown> = { ...current };
  for (const [, was] of changes.slice(0, steps)) {
    for (const [k, v] of Object.entries(was)) {
      if (v === null) delete c[k];
      else c[k] = v;
    }
  }
  return c as unknown as Card;
}

export type Tone = 'buff' | 'nerf' | 'other';
export interface Tag {
  label: string;
  tone: Tone;
}
/** One field's change, old -> new, ready to show. */
export interface FieldDiff {
  key: keyof Card;
  label: string;
  from: string;
  to: string;
  /** Number fields: better or worse for the card. */
  tone?: Tone;
}

/** One version of a card on its timeline, newest first. */
export interface Version {
  card: Card;
  /** The patch that brought this version in (undefined: the card as released). */
  patch?: string;
  /** When this version came in: the patch's date, or the card's release date. */
  date?: string;
  /** What changed from the version before, and how to tag it. */
  diffs: FieldDiff[];
  tags: Tag[];
  /** The text as it was before this version, when the text changed. */
  oldText?: string;
}

const STAT_LABEL: Partial<Record<keyof Card, string>> = { cost: 'Cost', attack: 'Attack', health: 'Health', armor: 'Armor', durability: 'Durability' };

function setName(code: string | undefined): string {
  if (!code) return '—';
  return { HOF: 'Hall of Fame', LEGACY: 'Legacy', CORE: 'Core', EVENT: 'Event' }[code] ?? SETS[code]?.name ?? code;
}

const show = (k: keyof Card, v: unknown): string => {
  if (v == null || (Array.isArray(v) && !v.length)) return 'None';
  if (k === 'races') return (v as string[]).map((r) => pretty('tribe', r)).join(' + ');
  if (k === 'classes') return (v as string[]).map((c) => pretty('class', c)).join(' + ');
  if (k === 'cardClass') return pretty('class', v as string);
  if (k === 'rarity') return pretty('rarity', v as string);
  if (k === 'spellSchool') return pretty('tribe', v as string);
  if (k === 'set') return setName(v as string);
  return String(v);
};

/** Diffs and tags for one change: `was` (the old fields) against `now` (the version it became). */
export function describe(was: Partial<Card>, now: Card): Pick<Version, 'diffs' | 'tags' | 'oldText'> {
  const diffs: FieldDiff[] = [];
  const tags: Tag[] = [];
  let up = 0;
  let down = 0;
  for (const [key, old] of Object.entries(was) as [keyof Card, unknown][]) {
    const cur = now[key];
    if (key === 'text') continue;
    const stat = STAT_LABEL[key];
    if (stat && typeof old === 'number' && typeof cur === 'number') {
      // Lower cost is better for the card; more of anything else is.
      const better = key === 'cost' ? cur < old : cur > old;
      better ? up++ : down++;
      diffs.push({ key, label: stat, from: String(old), to: String(cur), tone: better ? 'buff' : 'nerf' });
      continue;
    }
    const label = stat ?? { races: 'Tribe', spellSchool: 'School', rarity: 'Rarity', cardClass: 'Class', classes: 'Classes', set: 'Set' }[key as string] ?? String(key);
    diffs.push({ key, label, from: show(key, old), to: show(key, cur) });
  }
  if (up && !down) tags.push({ label: 'Buff', tone: 'buff' });
  else if (down && !up) tags.push({ label: 'Nerf', tone: 'nerf' });
  else if (up && down) tags.push({ label: 'Stats changed', tone: 'other' });
  const textChanged = 'text' in was;
  if (textChanged) tags.push({ label: 'Text changed', tone: 'other' });
  if ('races' in was) tags.push({ label: 'Tribe', tone: 'other' });
  if ('spellSchool' in was) tags.push({ label: 'School', tone: 'other' });
  if ('rarity' in was) tags.push({ label: 'Rarity', tone: 'other' });
  if ('cardClass' in was || 'classes' in was) tags.push({ label: 'Class', tone: 'other' });
  if ('set' in was) {
    const label = now.set === 'HOF' ? 'To Hall of Fame' : was.set === 'HOF' ? 'Out of Hall of Fame' : `To ${setName(now.set)}`;
    tags.push({ label, tone: 'other' });
  }
  return { diffs, tags, oldText: textChanged ? ((was.text as string | null) ?? '') : undefined };
}

/** Every version of a card, newest first: the current card, then each one before it. */
export function timeline(current: Card, h: HistoryFile | null): Version[] {
  const changes = h?.cards[current.id] ?? [];
  const out: Version[] = [];
  let card = current;
  for (let i = 0; i <= changes.length; i++) {
    const next = versionAt(current, changes, i + 1);
    if (i < changes.length) {
      const [patch, was] = changes[i];
      out.push({ card, patch, date: h!.dates[patch], ...describe(was, card) });
    } else out.push({ card, date: h?.dates[h.released?.[current.id] ?? ''], diffs: [], tags: [] });
    card = next;
  }
  return out;
}

/** "Sep 2014". */
export function monthYear(date: string | undefined): string {
  if (!date) return '';
  return new Date(`${date}T12:00:00`).toLocaleDateString('en', { month: 'short', year: 'numeric' });
}

/**
 * Word-level diff of two card texts (markup ignored): each word of `from`
 * marked if it was removed, each word of `to` marked if it was added.
 */
export function wordDiff(from: string, to: string): { removed: [string, boolean][]; added: [string, boolean][] } {
  const a = plainText(from).split(/\s+/).filter(Boolean);
  const b = plainText(to).split(/\s+/).filter(Boolean);
  const key = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Longest common subsequence over words.
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) L[i][j] = key(a[i]) === key(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const removed: [string, boolean][] = [];
  const added: [string, boolean][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && key(a[i]) === key(b[j])) {
      removed.push([a[i++], false]);
      added.push([b[j++], false]);
    } else if (j < b.length && (i >= a.length || L[i][j + 1] >= L[i + 1][j])) added.push([b[j++], true]);
    else removed.push([a[i++], true]);
  }
  return { removed, added };
}
