import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/app/routes';

describe('parseRoute', () => {
  it('reads the page, ignoring a CardDB search in the address', () => {
    expect(parseRoute('#/carddb')).toBe('carddb');
    expect(parseRoute("#/carddb?type=SPELL&name=C'Thun")).toBe('carddb');
    expect(parseRoute('#/gauntlet')).toBe('gauntlet');
    expect(parseRoute('#/card/EX1_116')).toBe('card');
    expect(parseRoute('#/nowhere')).toBe('menu');
  });
});
