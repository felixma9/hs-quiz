import type { Card } from '../../lib/types';
import { cardOfTheDay } from '../../lib/cards';
import { STANDARD_SETS, released } from '../../data/sets';

/**
 * Which cards HSdle plays with. The dailies are the same for everyone: their
 * pools come from the card data alone (never the menu's card pool), in a
 * fixed order, and the day picks from that.
 */

/** Card types HSdle can ask for. Heroes are left out. */
export const HSDLE_TYPES: readonly Card['type'][] = ['MINION', 'SPELL', 'WEAPON', 'LOCATION'];

/** The two dailies: Standard cards, or Classic ones (sets at least CLASSIC_AGE years old). */
export type Daily = 'standard' | 'classic';

/** A set is "classic" when it came out this many years ago or more. */
export const CLASSIC_AGE = 10;

export const playable = (cards: Card[]) => cards.filter((c) => HSDLE_TYPES.includes(c.type));

const standard = new Set(STANDARD_SETS);

/**
 * The cards a daily picks from, for the day `date` (YYYY-MM-DD). Classic is by
 * release year, so the pool moves forward a year each January.
 */
export function dailyPool(all: Card[], daily: Daily, date: string): Card[] {
  const year = Number(date.slice(0, 4));
  const fits =
    daily === 'standard'
      ? (c: Card) => standard.has(c.set)
      : (c: Card) => {
          const y = released(c).year;
          return y > 0 && y <= year - CLASSIC_AGE;
        };
  // dbfIds never change, so everyone has the same order (whatever order the data is in).
  return playable(all)
    .filter(fits)
    .sort((a, b) => a.dbfId - b.dbfId);
}

/** Today's card for a daily: the same for everyone on the same day. */
export function dailyCard(all: Card[], daily: Daily, date: string): Card | undefined {
  const pool = dailyPool(all, daily, date);
  return pool.length ? cardOfTheDay(pool, daily === 'standard' ? date : `classic:${date}`) : undefined;
}
