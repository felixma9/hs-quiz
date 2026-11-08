import type { Card } from './types';
import { SETS, setName } from '../data/sets';
import { pretty } from './attributes';

/**
 * Cardle: guess the mystery minion. Every guess is compared to the answer
 * column by column: green = same, yellow = partly the same, red = different,
 * with an arrow on ordered columns pointing toward the answer.
 */
export type ColumnKey = 'cost' | 'attack' | 'health' | 'keywords' | 'set' | 'rarity' | 'tribe' | 'class';
export type TileVerdict = 'correct' | 'close' | 'wrong';

export interface Tile {
  verdict: TileVerdict;
  /** The answer is higher / newer / rarer than the guess. */
  arrow?: 'up' | 'down';
  label: string;
}

export const COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'cost', label: 'Mana' },
  { key: 'attack', label: 'Attack' },
  { key: 'health', label: 'Health' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'tribe', label: 'Tribe' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'class', label: 'Class' },
  { key: 'set', label: 'Set' },
];

const RARITY_ORDER = ['FREE', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const SET_ORDER = Object.keys(SETS);

/** Release position of a set: by year, then by its place in the (chronological) set list. */
function setRank(set: string): number {
  const year = SETS[set]?.year ?? 0;
  const i = SET_ORDER.indexOf(set);
  return year * 1000 + (i < 0 ? 999 : i);
}

const arrow = (guess: number, answer: number): Tile['arrow'] => (answer > guess ? 'up' : answer < guess ? 'down' : undefined);

function numberTile(guess: number | undefined, answer: number | undefined): Tile {
  const g = guess ?? 0;
  const a = answer ?? 0;
  return { verdict: g === a ? 'correct' : 'wrong', arrow: arrow(g, a), label: String(g) };
}

/** Compare two lists (keywords, tribes, classes): same = green, overlap = yellow. */
function listTile(guess: string[], answer: string[], label: (v: string) => string, none = 'None'): Tile {
  const g = [...guess].sort();
  const a = [...answer].sort();
  const same = g.length === a.length && g.every((v, i) => v === a[i]);
  const overlap = g.some((v) => a.includes(v));
  return {
    verdict: same ? 'correct' : overlap ? 'close' : 'wrong',
    label: g.length ? g.map(label).join(', ') : none,
  };
}

const classesOf = (c: Card) => c.classes ?? [c.cardClass];

export function compare(guess: Card, answer: Card): Record<ColumnKey, Tile> {
  const sameYear = SETS[guess.set] && SETS[guess.set]?.year === SETS[answer.set]?.year;
  return {
    cost: numberTile(guess.cost, answer.cost),
    health: numberTile(guess.health, answer.health),
    attack: numberTile(guess.attack, answer.attack),
    keywords: listTile(guess.keywords ?? [], answer.keywords ?? [], (k) => k),
    set: {
      verdict: guess.set === answer.set ? 'correct' : sameYear ? 'close' : 'wrong',
      arrow: guess.set === answer.set ? undefined : arrow(setRank(guess.set), setRank(answer.set)),
      label: setName(guess.set),
    },
    rarity: {
      verdict: guess.rarity === answer.rarity ? 'correct' : 'wrong',
      arrow: arrow(RARITY_ORDER.indexOf(guess.rarity), RARITY_ORDER.indexOf(answer.rarity)),
      label: pretty('rarity', guess.rarity),
    },
    tribe: listTile(guess.races ?? [], answer.races ?? [], (r) => (r === 'ALL' ? 'All' : pretty('tribe', r))),
    class: listTile(classesOf(guess), classesOf(answer), (c) => pretty('class', c)),
  };
}

export const EMOJI: Record<TileVerdict, string> = { correct: '🟩', close: '🟨', wrong: '🟥' };

/** Number of wrong guesses before each clue unlocks. */
export const CLUES = [
  { key: 'art', label: 'Art', after: 4 },
  { key: 'text', label: 'Card text', after: 8 },
] as const;
