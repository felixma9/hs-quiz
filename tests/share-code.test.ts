import { describe, expect, it } from 'vitest';
import { SHARE_SETS, decodeSetup, encodeSetup } from '../src/pool/shareCode';
import { SETS } from '../src/data/sets';
import { DEFAULT_SETTINGS } from '../src/modes/gauntlet/settings';

describe('share codes', () => {
  it('cover every known set (add new sets to the end of SHARE_SETS)', () => {
    expect(Object.keys(SETS).filter((s) => !SHARE_SETS.includes(s))).toEqual([]);
  });
  it('round-trip', () => {
    const setup = {
      excludedSets: SHARE_SETS.filter((s) => !['TITANS', 'WILD_WEST', 'CORE'].includes(s)),
      excludedRarities: ['FREE', 'COMMON', 'RARE', 'EPIC'],
      gauntlet: { minionsOnly: true, allowed: DEFAULT_SETTINGS.allowed.filter((k) => k !== 'text') },
    };
    const code = encodeSetup(setup);
    expect(code.length).toBeLessThanOrEqual(11);
    const back = decodeSetup(code)!;
    expect(back.excludedSets.sort()).toEqual([...setup.excludedSets].sort());
    expect(back.excludedRarities).toEqual(setup.excludedRarities);
    expect(back.gauntlet).toEqual(setup.gauntlet);
  });
  it('defaults make a tiny code, and links decode too', () => {
    const code = encodeSetup({ excludedSets: [], excludedRarities: [], gauntlet: DEFAULT_SETTINGS });
    expect(code.length).toBeLessThanOrEqual(2);
    expect(decodeSetup(`https://example.com/hs-quiz/#/?s=${code}`)).toEqual({ excludedSets: [], excludedRarities: [], gauntlet: DEFAULT_SETTINGS });
  });
  it('rejects junk', () => {
    expect(decodeSetup('hello world')).toBeNull();
    expect(decodeSetup('')).toBeNull();
    expect(decodeSetup('AAAAAAAAAAAAAA')).toBeNull();
  });
});
