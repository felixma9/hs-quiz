import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

describe('set timeline', () => {
  const cards: Card[] = JSON.parse(readFileSync('public/cards.json', 'utf8'));
  const byName = (n: string) => cards.find((c) => c.name === n)!;
  const byId = (id: string) => cards.find((c) => c.id === id)!;

  it('calls the old Basic set Basic, not Legacy', () => {
    expect(compare(byName('Fireball'), byName('Leeroy Jenkins')).set.label).toBe('Basic');
  });

  it('places Core and Event cards where they came out', () => {
    const barrens = cards.find((c) => c.set === 'THE_BARRENS')!;
    const alterac = cards.find((c) => c.set === 'ALTERAC_VALLEY')!;
    const coreLaunch = cards.find((c) => c.set === 'CORE' && c.id.startsWith('CS3_'))!;
    // A first-Core card (March 2021) is older than Barrens; Alterac is newer.
    expect(compare(barrens, coreLaunch).set.arrow).toBe('down');
    expect(compare(alterac, coreLaunch).set.arrow).toBe('down');
    // A Cataclysm event card is from 2026, newer than anything from 2020.
    const event = cards.find((c) => c.set === 'EVENT' && c.id.startsWith('CATA_'))!;
    const cata = cards.find((c) => c.set === 'CATACLYSM')!;
    expect(compare(cards.find((c) => c.set === 'DARKMOON_FAIRE')!, event).set.arrow).toBe('up');
    expect(compare(cata, event).set).toMatchObject({ verdict: 'close', arrow: undefined });
    expect(byId('CS3_007')).toBeTruthy();
  });
});

describe('hsdle dailies', async () => {
  const { dailyCard, dailyPool, HSDLE_TYPES } = await import('../src/modes/hsdle/pools');
  const { STANDARD_SETS, released } = await import('../src/data/sets');
  const cards: Card[] = JSON.parse(readFileSync('public/cards.json', 'utf8'));

  it('pick the same card for everyone, whatever order the cards come in', () => {
    const shuffled = [...cards].reverse();
    for (const date of ['2026-11-12', '2027-01-01', '2030-06-30']) {
      expect(dailyCard(shuffled, 'standard', date)!.id).toBe(dailyCard(cards, 'standard', date)!.id);
      expect(dailyCard(shuffled, 'classic', date)!.id).toBe(dailyCard(cards, 'classic', date)!.id);
    }
  });

  it('standard uses Standard sets; classic uses sets 10+ years old; both skip heroes', () => {
    const std = dailyPool(cards, 'standard', '2026-11-12');
    const classic = dailyPool(cards, 'classic', '2026-11-12');
    expect(std.length).toBeGreaterThan(100);
    expect(std.every((c) => STANDARD_SETS.includes(c.set) && HSDLE_TYPES.includes(c.type))).toBe(true);
    expect(classic.every((c) => released(c).year <= 2016 && c.type !== 'HERO')).toBe(true);
    expect(classic.some((c) => c.name === 'Leeroy Jenkins')).toBe(true);
    expect(classic.some((c) => c.type === 'SPELL') && classic.some((c) => c.type === 'WEAPON')).toBe(true);
    // A year later, 2017's sets are classic too.
    expect(dailyPool(cards, 'classic', '2027-03-01').some((c) => c.set === 'UNGORO')).toBe(true);
    expect(classic.some((c) => c.set === 'UNGORO')).toBe(false);
  });

  it('come up with spells, weapons and locations too over a year', () => {
    const types = new Set<string>();
    for (let d = 1; d <= 365; d++) {
      const date = new Date(Date.UTC(2026, 0, d)).toISOString().slice(0, 10);
      types.add(dailyCard(cards, 'standard', date)!.type);
    }
    expect([...types].sort()).toEqual(['LOCATION', 'MINION', 'SPELL', 'WEAPON']);
  });
});

describe('hsdle columns by card type', async () => {
  const { columnsFor } = await import('../src/modes/hsdle/compare');
  const keys = (t: Card['type']) => columnsFor(t).map((c) => c.key);
  it('only shows what the type has', () => {
    expect(keys('SPELL')).toEqual(['cost', 'rarity', 'tribe', 'keywords', 'class', 'set']);
    expect(keys('WEAPON')).toEqual(['cost', 'attack', 'health', 'rarity', 'keywords', 'class', 'set']);
    expect(keys('LOCATION')).toEqual(['cost', 'health', 'rarity', 'keywords', 'class', 'set']);
    expect(columnsFor('SPELL').find((c) => c.key === 'tribe')!.label).toBe('School');
  });
  it('compares spell schools and weapon durability', () => {
    const spell: Card = { ...base, type: 'SPELL', attack: undefined, health: undefined, spellSchool: 'FIRE' };
    expect(compare({ ...spell, spellSchool: 'FROST' }, spell).tribe).toMatchObject({ verdict: 'wrong', label: 'Frost' });
    expect(compare(spell, spell).tribe.verdict).toBe('correct');
    const weapon: Card = { ...base, type: 'WEAPON', health: undefined, durability: 3 };
    expect(compare({ ...weapon, durability: 2 }, weapon).health).toMatchObject({ verdict: 'wrong', arrow: 'up', label: '2' });
  });
});
