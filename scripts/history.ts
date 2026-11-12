import type { Card } from '../src/lib/types';
import type { Change } from '../src/lib/history';
import { cleanText, slim, type RawCard } from './transform';

/**
 * Card history: how each card changed across game patches.
 *
 * public/card-history.json lists only cards that changed. Each card id maps to
 * its changes, newest first, as [patch, was]: "in this patch the card changed;
 * before it, these fields were `was`" (null = the field wasn't there).
 * Applying each `was` to the current card in turn gives every older version.
 * Only old values are stored: a change's new value is the next newer version.
 * A card with no entry hasn't changed since it came out.
 */
export type { Change, HistoryFile } from '../src/lib/history';
export { versionAt } from '../src/lib/history';

/** Fields whose changes are recorded. */
export const TRACKED = [
  'type', 'cost', 'attack', 'health', 'durability', 'armor', 'text', 'rarity', 'races', 'spellSchool', 'cardClass', 'classes', 'set',
] as const satisfies readonly (keyof Card)[];
type Tracked = (typeof TRACKED)[number];

/**
 * Fields older builds didn't have at all (spell schools arrived in 2020,
 * multi-class lists in 2016). A card missing one of these in an old build
 * says nothing about the card, so it isn't recorded as a change.
 */
const LATE_FIELDS = new Set<Tracked>(['spellSchool', 'classes']);

/**
 * A build's raw card as the site's Card (same transform as cards.json), in
 * today's data format: older builds name the class `playerClass`, and until
 * 32.0 a weapon's durability was `durability` rather than `health`.
 */
export function toCard(r: RawCard): Card {
  const weaponDurability = r.type === 'WEAPON' && r.health == null && r.durability != null;
  return slim({
    ...r,
    cardClass: r.cardClass ?? r.playerClass,
    ...(weaponDurability ? { health: r.durability, durability: undefined } : {}),
  });
}

/** Fields every card has: a build missing one is a gap in the data, so the last known value carries over. */
const ALWAYS = ['set', 'rarity', 'cardClass'] as const;

/**
 * Card text as it reads, for spotting real wording changes: no markup, case,
 * punctuation or spacing (old builds format the same text differently).
 */
export function textKey(text: string | undefined): string {
  return cleanText(text, false)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const same = (k: Tracked, a: Card[Tracked], b: Card[Tracked]) =>
  k === 'text' ? textKey(a as string) === textKey(b as string) : JSON.stringify(a) === JSON.stringify(b);

/** The fields of `older` that differ from `newer`, as `older` had them. */
export function diff(older: Card, newer: Card): Partial<Card> | null {
  const was: Partial<Card> = {};
  let any = false;
  for (const k of TRACKED) {
    if (older[k] === undefined && LATE_FIELDS.has(k)) continue;
    // Every hero card has armor; one without it in an old build is a gap in the data (the Death
    // Knight heroes lacked it in 9.0.0), not a hero that had none. A minion that later became a
    // hero (Lord Jaraxxus) did gain armor, and its old version isn't a hero, so it still counts.
    if (k === 'armor' && older.armor === undefined && older.type === 'HERO') continue;
    if (same(k, older[k], newer[k])) continue;
    (was as Record<string, unknown>)[k] = older[k] ?? null;
    any = true;
  }
  return any ? was : null;
}

/**
 * One card's changes, newest first, from its versions oldest first (each
 * tagged with the patch it appeared in; the last is the current card).
 */
export function historyOf(versions: { patch: string; card: Card }[]): Change[] {
  // Fill data gaps, then keep each patch's last version (hotfix builds within a patch count as one change).
  const filled: { patch: string; card: Card }[] = [];
  for (const v of versions) {
    const card = { ...v.card };
    const prev = filled.at(-1)?.card;
    for (const k of ALWAYS) if (card[k] == null && prev?.[k] != null) (card as Record<string, unknown>)[k] = prev[k];
    if (filled.length && filled.at(-1)!.patch === v.patch) filled[filled.length - 1] = { patch: v.patch, card };
    else filled.push({ patch: v.patch, card });
  }
  const changes: Change[] = [];
  for (let i = 1; i < filled.length; i++) {
    const was = diff(filled[i - 1].card, filled[i].card);
    if (was) changes.push([filled[i].patch, was]);
  }
  return changes.reverse();
}
