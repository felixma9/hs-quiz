import { describe, expect, it } from 'vitest';
import { lcsWords, levenshtein, normalizeName, words } from '../src/lib/fuzzy';

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
  it('lcs marks matched words', () => {
    const r = lcsWords(['deal', '6', 'damage'], ['deal', 'damage']);
    expect(r.length).toBe(2);
    expect(r.inA).toEqual([true, false, true]);
  });
});
