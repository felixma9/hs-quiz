import type { Card } from '../../lib/types';
import { released, setName } from '../../data/sets';
import { pretty } from '../../lib/attributes';

/**
 * HSdle: guess the mystery card (a minion, spell, weapon or location; its type
 * is given, and guesses are cards of the same type). Every guess is compared
 * to the answer column by column: green = same, yellow = partly the same,
 * red = different, with an arrow on ordered columns pointing toward the answer.
 */
export type ColumnKey = 'cost' | 'attack' | 'health' | 'keywords' | 'set' | 'rarity' | 'tribe' | 'class';
export type TileVerdict = 'correct' | 'close' | 'wrong';

export interface Tile {
  verdict: TileVerdict;
  /** The answer is higher / newer / rarer than the guess. */
  arrow?: 'up' | 'down';
  label: string;
}

interface Column {
  key: ColumnKey;
  label: string;
}

/** The board's columns for this type of card: only what the type has (spells have no stats, weapons no tribe). */
export function columnsFor(type: Card['type']): Column[] {
  const c = (key: ColumnKey, label: string): Column => ({ key, label });
  const tail = [c('keywords', 'Keywords'), c('class', 'Class'), c('set', 'Set')];
  switch (type) {
    case 'SPELL':
      return [c('cost', 'Mana'), c('rarity', 'Rarity'), c('tribe', 'School'), ...tail];
    case 'WEAPON':
      return [c('cost', 'Mana'), c('attack', 'Attack'), c('health', 'Durability'), c('rarity', 'Rarity'), ...tail];
    case 'LOCATION':
      return [c('cost', 'Mana'), c('health', 'Durability'), c('rarity', 'Rarity'), ...tail];
    default:
      return [c('cost', 'Mana'), c('attack', 'Attack'), c('health', 'Health'), c('rarity', 'Rarity'), c('tribe', 'Tribe'), ...tail];
  }
}

const RARITY_ORDER = ['FREE', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
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
/** Health, or durability for weapons (locations keep theirs in health). */
const healthOf = (c: Card) => c.health ?? c.durability;
/** A minion's tribes, or a spell's school. */
const tribesOf = (c: Card) => (c.type === 'SPELL' ? (c.spellSchool ? [c.spellSchool] : []) : (c.races ?? []));

export function compare(guess: Card, answer: Card): Record<ColumnKey, Tile> {
  const g = released(guess);
  const a = released(answer);
  const sameYear = g.year > 0 && g.year === a.year;
  return {
    cost: numberTile(guess.cost, answer.cost),
    health: numberTile(healthOf(guess), healthOf(answer)),
    attack: numberTile(guess.attack, answer.attack),
    keywords: listTile(guess.keywords ?? [], answer.keywords ?? [], (k) => k),
    set: {
      verdict: guess.set === answer.set ? 'correct' : sameYear ? 'close' : 'wrong',
      arrow: guess.set === answer.set || g.rank === a.rank ? undefined : arrow(g.rank, a.rank),
      label: setName(guess.set),
    },
    rarity: {
      verdict: guess.rarity === answer.rarity ? 'correct' : 'wrong',
      arrow: arrow(RARITY_ORDER.indexOf(guess.rarity), RARITY_ORDER.indexOf(answer.rarity)),
      label: pretty('rarity', guess.rarity),
    },
    tribe: listTile(tribesOf(guess), tribesOf(answer), (r) => (r === 'ALL' ? 'All' : pretty('tribe', r))),
    class: listTile(classesOf(guess), classesOf(answer), (c) => pretty('class', c)),
  };
}

export const EMOJI: Record<TileVerdict, string> = { correct: '🟩', close: '🟨', wrong: '🟥' };

/** Number of wrong guesses before each clue unlocks. */
export const CLUES = [
  { key: 'art', label: 'Art', after: 4 },
  { key: 'text', label: 'Card text', after: 8 },
] as const;
