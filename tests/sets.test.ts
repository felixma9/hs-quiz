import { describe, expect, it } from 'vitest';
import { SETS, STANDARD_SETS } from '../src/data/sets';

describe('standard sets', () => {
  it('only lists known sets', () => {
    for (const s of STANDARD_SETS) expect(SETS[s], s).toBeDefined();
  });
});
