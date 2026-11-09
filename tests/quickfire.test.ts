import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findCard, makePrompt, namePrefix } from '../src/modes/quickfire/prompts';
import type { Card } from '../src/lib/types';

const cards: Card[] = JSON.parse(readFileSync('public/cards.json', 'utf8')).filter((c: Card) => c.type !== 'LOCATION');

// Seeded RNG so failures repeat.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

describe('quickfire prompts', () => {
  it('always have answers, and every answer passes its own test', () => {
    const r = rng(7);
    for (let i = 0; i < 300; i++) {
      const p = makePrompt(cards, new Set(), r);
      expect(p.answers.length, p.text).toBeGreaterThan(0);
      expect(p.answers.every((c) => p.test(c))).toBe(true);
      expect(p.text).not.toMatch(/\ba \*\*[AEIOU8]/);
    }
  });
  it('work on a tiny pool (Legendaries from one set)', () => {
    const tiny = cards.filter((c) => c.rarity === 'LEGENDARY' && c.set === 'TITANS');
    const r = rng(3);
    for (let i = 0; i < 50; i++) expect(makePrompt(tiny, new Set(), r).answers.length).toBeGreaterThan(0);
  });
  it('name prefixes are partial', () => {
    expect(namePrefix('Chillwind Yeti')).toBe('Chill');
    expect(namePrefix('Leeroy Jenkins')).toBe('Leero');
    expect(namePrefix('Wisp')).toBeNull();
  });
  it('finds cards despite typos and punctuation', () => {
    expect(findCard('chillwind yeti', cards)?.name).toBe('Chillwind Yeti');
    expect(findCard('Chilwind Yeti', cards)?.name).toBe('Chillwind Yeti');
    expect(findCard('alakir the windlord', cards)?.name).toMatch(/Al'Akir/);
    expect(findCard('zzzz qqq', cards)).toBeNull();
  });
});
