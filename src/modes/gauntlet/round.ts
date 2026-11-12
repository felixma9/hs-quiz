import type { Card } from '../../lib/types';
import { ATTR, type AttrKey } from '../../lib/attributes';
import { giveaways, pickHidden, randomCard } from '../../lib/cards';

/** One Gauntlet question: a card with one field blank. */
export interface Round {
  card: Card;
  hidden: AttrKey;
}

/** How to fill in each kind of blank on the card. */
const HOW: Record<string, string> = {
  number: 'tap the gem.',
  name: 'tap the name banner.',
  text: 'tap the text box and type the gist (blank if none).',
  class: 'tap the frame.',
  rarity: 'tap the gem under the name.',
  tribe: 'tap the banner at the bottom.',
};
export const howTo = (k: AttrKey) => HOW[ATTR[k].kind === 'enum' ? k : ATTR[k].kind];

/**
 * A random card with one of the allowed fields blank. Skips fields with only
 * one possible answer in the pool, and cards in `skip` (already played) when it can.
 */
export function newRound(pool: Card[], allowed: AttrKey[], rng = Math.random, skip?: Set<string>, free = giveaways(pool)): Round {
  for (let i = 0; i < 50; i++) {
    const card = randomCard(pool, rng);
    if (skip?.has(card.id) && i < 40) continue;
    const hidden = pickHidden(card, allowed.filter((k) => !free.has(`${card.type}:${k}`)), rng);
    if (hidden) return { card, hidden };
  }
  return { card: randomCard(pool, rng), hidden: 'name' };
}
