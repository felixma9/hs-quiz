import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SETS } from '../src/data/sets';
import { setIconAsset } from '../src/card/sunwell';

// Sets Sunwell draws an icon for itself; LEGACY (Basic) has none in the game.
const SUNWELL_OWN = ['EXPERT1', 'NAXX', 'GVG', 'BRM', 'TGT', 'LOE', 'OG', 'KARA', 'GANGS', 'UNGORO', 'ICECROWN', 'LOOTAPALOOZA', 'GILNEAS', 'BOOMSDAY', 'TROLL', 'DALARAN'];

describe('set icons', () => {
  it('every set but Basic has an icon file', () => {
    for (const set of Object.keys(SETS)) {
      if (set === 'LEGACY') continue;
      const asset = setIconAsset(set) ?? (SUNWELL_OWN.includes(set) ? `set-${set.toLowerCase()}` : null);
      expect(asset, set).not.toBeNull();
      expect(existsSync(`public/sunwell/${asset}.webp`), `${asset}.webp`).toBe(true);
    }
  });
});
