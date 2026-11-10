import { describe, expect, it } from 'vitest';
import { gradeEnum, gradeName, gradeNumber, gradeText } from '../src/lib/grade';
import { gradeAttr } from '../src/lib/attributes';
import type { Card } from '../src/lib/types';

const leeroy: Card = {
  id: 'EX1_116', dbfId: 559, name: 'Leeroy Jenkins', type: 'MINION', cardClass: 'NEUTRAL',
  cost: 5, attack: 6, health: 2, rarity: 'LEGENDARY', set: 'EXPERT1',
  text: '<b>Charge</b>. <b>Battlecry:</b> Summon two 1/1 Whelps for your opponent.',
};
const fireball: Card = {
  id: 'CS2_029', dbfId: 315, name: 'Fireball', type: 'SPELL', cardClass: 'MAGE', cost: 4,
  rarity: 'FREE', set: 'LEGACY', spellSchool: 'FIRE', text: 'Deal 6 damage.',
};

describe('numbers', () => {
  it('exact, close, wrong with arrows', () => {
    expect(gradeNumber(5, 5).verdict).toBe('correct');
    expect(gradeNumber(4, 5)).toEqual({ verdict: 'close', arrow: 'up' });
    expect(gradeNumber(9, 5)).toEqual({ verdict: 'wrong', arrow: 'down' });
    expect(gradeNumber(null, null).verdict).toBe('correct');
    expect(gradeNumber(3, null).verdict).toBe('wrong');
  });
  it('blank number field means none', () => {
    expect(gradeAttr('attack', '', fireball).verdict).toBe('correct');
    expect(gradeAttr('attack', '0', fireball).verdict).toBe('wrong');
    expect(gradeAttr('attack', '6', leeroy).verdict).toBe('correct');
  });
});

describe('enums', () => {
  it('exact and overlap', () => {
    expect(gradeEnum('BEAST', 'BEAST').verdict).toBe('correct');
    expect(gradeEnum('BEAST', 'BEAST + UNDEAD').verdict).toBe('close');
    expect(gradeEnum('NONE', 'BEAST').verdict).toBe('wrong');
  });
  it('class overlap is close for multiclass cards', () => {
    expect(gradeAttr('class', 'MAGE', { ...fireball, classes: ['MAGE', 'ROGUE'] }).verdict).toBe('close');
  });
});

describe('names', () => {
  it('allows small typos', () => {
    expect(gradeName('Leroy Jenkins', 'Leeroy Jenkins').verdict).toBe('correct');
    expect(gradeName('leeroy jenkins', 'Leeroy Jenkins').verdict).toBe('correct');
    expect(gradeName('Fireblast', 'Fireball').verdict).toBe('wrong');
    expect(gradeName('Ice', 'Imp').verdict).toBe('wrong');
  });
});

describe('text', () => {
  it('ignores case and punctuation', () => {
    expect(gradeText('deal 6 damage', 'Deal 6 damage.').verdict).toBe('correct');
  });
  it('wrong number fails', () => {
    const g = gradeText('deal 7 damage', 'Deal 6 damage.');
    expect(g.verdict).not.toBe('correct');
  });
  it('a close paraphrase passes', () => {
    expect(gradeAttr('text', 'Charge. Battlecry: give your opponent two 1/1 whelps.', leeroy).verdict).toBe('correct');
  });
  it('a half-remembered text gets partial credit', () => {
    const g = gradeAttr('text', 'Charge. Battlecry: summon some whelps.', leeroy);
    expect(g.verdict).toBe('close');
  });
  it('an unrelated text fails', () => {
    expect(gradeAttr('text', 'Taunt. Deathrattle: draw a card.', leeroy).verdict).toBe('wrong');
  });
  it('blank matches a card with no text', () => {
    expect(gradeText('', '').verdict).toBe('correct');
    expect(gradeText('taunt', '').verdict).toBe('wrong');
  });
});

describe('card text tags', () => {
  it('grades against the text without <b> tags', () => {
    expect(gradeAttr('text', 'Charge. Battlecry: Summon two 1/1 Whelps for your opponent.', leeroy).verdict).toBe('correct');
  });
});

describe('forgiving text', () => {
  it('number words count as digits', () => {
    expect(gradeText('Charge. Battlecry: Summon 2 1/1 Whelps for your opponent.', 'Charge. Battlecry: Summon two 1/1 Whelps for your opponent.').verdict).toBe('correct');
    expect(gradeText('Deal six damage', 'Deal 6 damage.').verdict).toBe('correct');
  });
  it('small typos in longer words are fine', () => {
    expect(gradeText('Battlecyr: Summon two 1/1 Whelps for your oponent.', 'Battlecry: Summon two 1/1 Whelps for your opponent.').verdict).toBe('correct');
  });
  it('a wrong number still fails', () => {
    expect(gradeText('Deal seven damage', 'Deal 6 damage.').verdict).not.toBe('correct');
  });
});

describe('order, filler and plurals', () => {
  it('ignores word order and filler words', () => {
    expect(gradeText('summon two 1/1 whelps for opponent, charge, battlecry', 'Charge. Battlecry: Summon two 1/1 Whelps for your opponent.').verdict).toBe('correct');
  });
  it('matches plurals', () => {
    expect(gradeText('Draw 2 card', 'Draw 2 cards.').verdict).toBe('correct');
  });
  it('numbers may come in any order but must all be there', () => {
    expect(gradeText('Give a minion +2/+1', 'Give a minion +1/+2.').verdict).toBe('correct');
    expect(gradeText('Give a minion +2', 'Give a minion +1/+2.').verdict).not.toBe('correct');
  });
});

describe('lenient text (Gauntlet VS)', () => {
  const truth = 'Battlecry: Deal 3 damage to an enemy minion. Draw a card.';
  it('passes on the gist', () => {
    expect(gradeText('deal damage draw card', truth, true).verdict).toBe('correct');
    expect(gradeText('battlecry deal 2 damage to a minion', truth, true).verdict).toBe('correct');
  });
  it('is stricter without it', () => {
    expect(gradeText('deal damage draw card', truth).verdict).not.toBe('correct');
  });
  it("doesn't pass nonsense or keyword spam", () => {
    expect(gradeText('summon a 2/2 copy', truth, true).verdict).not.toBe('correct');
    expect(gradeText('deathrattle taunt rush charge lifesteal discover freeze silence armor damage', truth, true).verdict).not.toBe('correct');
  });
});
