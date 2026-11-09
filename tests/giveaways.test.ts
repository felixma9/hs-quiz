import { describe, expect, it } from 'vitest';
import { giveaways, pickHidden } from '../src/lib/cards';
import type { Card } from '../src/lib/types';

const card = (o: Partial<Card>): Card => ({
  id: 'X', dbfId: 1, name: 'X', type: 'MINION', cardClass: 'MAGE', cost: 1, attack: 1, health: 1, rarity: 'LEGENDARY', set: 'CORE', ...o,
});

describe('gauntlet giveaways', () => {
  it('skips rarity when the pool has one rarity', () => {
    const pool = [card({ id: 'a', cardClass: 'MAGE' }), card({ id: 'b', cardClass: 'PRIEST' })];
    const skip = giveaways(pool);
    expect(skip.has('MINION:rarity')).toBe(true);
    expect(skip.has('MINION:class')).toBe(false);
    for (let i = 0; i < 50; i++) {
      const allowed = (['rarity', 'class'] as const).filter((k) => !skip.has(`MINION:${k}`));
      expect(pickHidden(pool[0], [...allowed])).toBe('class');
    }
  });
  it('keeps rarity when there is a choice', () => {
    expect(giveaways([card({ rarity: 'EPIC' }), card({ rarity: 'RARE' })]).has('MINION:rarity')).toBe(false);
  });
});
