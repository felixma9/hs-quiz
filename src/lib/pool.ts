import type { Card } from './types';
import { load, save } from './storage';

const KEY = 'hsq:excludedSets';

/** Sets the player turned off. Stored as exclusions so new expansions start switched on. */
export const loadExcluded = (): string[] => load<string[]>(KEY, []);
export const saveExcluded = (sets: string[]) => save(KEY, sets);

/** Card types the frame renderer can draw. Locations are newer than it. */
const DRAWABLE = new Set(['MINION', 'SPELL', 'WEAPON', 'HERO']);

export function drawable(cards: Card[]): Card[] {
  return cards.filter((c) => DRAWABLE.has(c.type));
}

const RARITY_KEY = 'hsq:excludedRarities';
export const loadExcludedRarities = (): string[] => load<string[]>(RARITY_KEY, []);
export const saveExcludedRarities = (r: string[]) => save(RARITY_KEY, r);

export function filterPool(cards: Card[], excludedSets: string[], excludedRarities: string[] = []): Card[] {
  const ex = new Set(excludedSets);
  const exR = new Set(excludedRarities);
  return cards.filter((c) => !ex.has(c.set) && !exR.has(c.rarity));
}
