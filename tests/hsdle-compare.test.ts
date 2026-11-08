import { describe, expect, it } from 'vitest';
import { compare } from '../src/modes/hsdle/compare';
import { filterPool } from '../src/pool/pool';
import type { Card } from '../src/lib/types';

const base: Card = {
  id: 'X', dbfId: 1, name: 'X', type: 'MINION', cardClass: 'NEUTRAL', cost: 5, attack: 6, health: 2,
  rarity: 'LEGENDARY', set: 'EXPERT1', keywords: ['Battlecry', 'Charge'],
};

describe('hsdle compare', () => {
  it('identical card is all green', () => {
    const t = compare(base, base);
    expect(Object.values(t).every((x) => x.verdict === 'correct')).toBe(true);
  });
  it('numbers point toward the answer', () => {
    const t = compare({ ...base, cost: 3, attack: 8 }, base);
    expect(t.cost).toMatchObject({ verdict: 'wrong', arrow: 'up' });
    expect(t.attack).toMatchObject({ verdict: 'wrong', arrow: 'down' });
  });
  it('keyword, tribe and class overlap is yellow', () => {
    const t = compare(
      { ...base, keywords: ['Charge', 'Taunt'], races: ['BEAST'], classes: ['MAGE', 'ROGUE'], cardClass: 'MAGE' },
      { ...base, races: ['BEAST', 'UNDEAD'], cardClass: 'ROGUE' },
    );
    expect(t.keywords.verdict).toBe('close');
    expect(t.tribe.verdict).toBe('close');
    expect(t.class.verdict).toBe('close');
  });
  it('no keywords vs no keywords is green', () => {
    expect(compare({ ...base, keywords: undefined }, { ...base, keywords: undefined }).keywords.verdict).toBe('correct');
  });
  it('set: same year is yellow, arrow points to newer/older', () => {
    expect(compare({ ...base, set: 'NAXX' }, base).set.verdict).toBe('close');
    expect(compare({ ...base, set: 'TITANS' }, base).set).toMatchObject({ verdict: 'wrong', arrow: 'down' });
    expect(compare(base, { ...base, set: 'TITANS' }).set.arrow).toBe('up');
  });
  it('rarity arrow points to rarer/commoner', () => {
    expect(compare({ ...base, rarity: 'RARE' }, base).rarity).toMatchObject({ verdict: 'wrong', arrow: 'up' });
  });
});

describe('card pool filter', () => {
  it('filters by set and rarity', () => {
    const cards = [
      { ...base, id: 'a', rarity: 'COMMON', set: 'EXPERT1' },
      { ...base, id: 'b', rarity: 'LEGENDARY', set: 'EXPERT1' },
      { ...base, id: 'c', rarity: 'LEGENDARY', set: 'NAXX' },
    ];
    expect(filterPool(cards, [], ['COMMON']).map((c) => c.id)).toEqual(['b', 'c']);
    expect(filterPool(cards, ['NAXX'], ['COMMON']).map((c) => c.id)).toEqual(['b']);
  });
});
