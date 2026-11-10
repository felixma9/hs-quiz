import { describe, expect, it } from 'vitest';
import { levenshtein, matchWords, normalizeName, words } from '../src/lib/fuzzy';

describe('fuzzy', () => {
  it('normalizes names', () => {
    expect(normalizeName("Al'Akir the Windlord")).toBe('alakirthewindlord');
    expect(normalizeName('Ultra-Capacitor')).toBe('ultracapacitor');
  });
  it('splits words', () => {
    expect(words('Deal 6 damage. Summon a 1/1!')).toEqual(['deal', '6', 'damage', 'summon', 'a', '1', '1']);
    expect(words('Draw two cards twice')).toEqual(['draw', '2', 'cards', '2']);
  });
  it('levenshtein', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });
  it('matchWords pairs words in any order', () => {
    const r = matchWords(['deal', '6', 'damage'], ['damage', 'deal']);
    expect(r.inTruth).toEqual([true, false, true]);
  });
});

describe('abbreviations', () => {
  it('expands common card-text shorthand', () => {
    expect(words('Deal 3 dmg to ur opp, w/ bc')).toEqual(['deal', '3', 'damage', 'to', 'your', 'opponent', 'with', 'battlecry']);
    expect(words('at eot gain 2 atk')).toEqual(['at', 'end', 'of', 'turn', 'gain', '2', 'attack']);
  });
});
