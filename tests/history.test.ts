import { describe, expect, it } from 'vitest';
import { diff, historyOf, textKey, toCard, versionAt } from '../scripts/history';
import type { RawCard } from '../scripts/transform';

const leeroy = (over: Partial<RawCard> = {}): RawCard => ({
  id: 'EX1_116', dbfId: 559, name: 'Leeroy Jenkins', type: 'MINION', set: 'EXPERT1', rarity: 'LEGENDARY',
  cardClass: 'NEUTRAL', cost: 5, attack: 6, health: 2,
  text: '<b>Charge</b>. <b>Battlecry:</b> Summon two 1/1 Whelps for your opponent.', ...over,
});

describe('textKey', () => {
  it('ignores markup, case, punctuation and spacing', () => {
    expect(textKey('<b>Charge</b>. <b>Battlecry:</b> Summon two 1/1 Whelps\nfor your opponent.')).toBe(
      textKey('[x]<b>Charge.</b> <b>Battlecry</b>: summon two 1/1 Whelps for your opponent'),
    );
  });
  it('still sees a real wording change', () => {
    expect(textKey('Deal $3 damage.')).not.toBe(textKey('Deal $2 damage.'));
  });
});

describe('diff', () => {
  it('keeps only the fields that changed, with their old values', () => {
    expect(diff(toCard(leeroy({ cost: 4 })), toCard(leeroy()))).toEqual({ cost: 4 });
  });
  it('is null when only formatting changed', () => {
    expect(diff(toCard(leeroy({ text: '<b>Charge</b>. <b>Battlecry:</b> Summon two 1/1 Whelps for your opponent' })), toCard(leeroy()))).toBeNull();
  });
  it('reads the old playerClass field', () => {
    expect(diff(toCard(leeroy({ cardClass: undefined, playerClass: 'NEUTRAL' })), toCard(leeroy()))).toBeNull();
  });
  it("skips fields old builds didn't have", () => {
    const spell = { id: 'X', dbfId: 1, name: 'Fireball', type: 'SPELL', set: 'CORE', cardClass: 'MAGE', cost: 4 };
    expect(diff(toCard(spell), toCard({ ...spell, spellSchool: 'FIRE' }))).toBeNull();
  });
  it('records a field that was added (old value null) or removed', () => {
    expect(diff(toCard(leeroy({ races: undefined })), toCard(leeroy({ races: ['DRAGON'] })))).toEqual({ races: null });
    expect(diff(toCard(leeroy({ set: 'EXPERT1' })), toCard(leeroy({ set: 'HOF' })))).toEqual({ set: 'EXPERT1' });
  });
});

describe('historyOf / versionAt', () => {
  const v = [
    { patch: '1.0.0', card: toCard(leeroy({ cost: 4 })) },
    { patch: '1.0.1', card: toCard(leeroy({ cost: 4, text: '<b>Charge</b>. <b>Battlecry:</b> Summon two 1/1 Whelps for your opponent' })) },
    { patch: '4.1.0', card: toCard(leeroy()) },
    { patch: '12.0.0', card: toCard(leeroy({ set: 'HOF' })) },
  ];
  const h = historyOf(v);
  it('lists changes newest first, skipping formatting-only versions', () => {
    expect(h).toEqual([['12.0.0', { set: 'EXPERT1' }], ['4.1.0', { cost: 4 }]]);
  });
  it('rebuilds each older version from the current card', () => {
    const now = v[3].card;
    expect(versionAt(now, h, 0)).toEqual(now);
    expect(versionAt(now, h, 1)).toMatchObject({ set: 'EXPERT1', cost: 5 });
    expect(versionAt(now, h, 2)).toMatchObject({ set: 'EXPERT1', cost: 4 });
  });
  it('has no changes for an unchanged card', () => {
    expect(historyOf([v[0], { patch: '2.0.0', card: v[0].card }])).toEqual([]);
  });
});

describe('data quirks', () => {
  it('reads old weapon durability as health (the format since 32.0)', () => {
    const axe = { id: 'CS2_112', dbfId: 2, name: 'Arcanite Reaper', type: 'WEAPON', set: 'CORE', cardClass: 'WARRIOR', cost: 5, attack: 5 };
    expect(diff(toCard({ ...axe, durability: 2 }), toCard({ ...axe, health: 2 }))).toBeNull();
    expect(diff(toCard({ ...axe, durability: 3 }), toCard({ ...axe, health: 2 }))).toEqual({ health: 3 });
  });
  it('fills a field one build is missing from the build before', () => {
    const gap = { ...toCard(leeroy()), set: undefined as unknown as string };
    const h = historyOf([
      { patch: '1.0.0', card: toCard(leeroy()) },
      { patch: '11.0.0', card: gap },
      { patch: '11.4.0', card: toCard(leeroy()) },
    ]);
    expect(h).toEqual([]);
  });
  it('counts hotfix builds within one patch as one change', () => {
    const h = historyOf([
      { patch: '1.0.0', card: toCard(leeroy({ cost: 4 })) },
      { patch: '11.0.0', card: toCard(leeroy({ cost: 6 })) },
      { patch: '11.0.0', card: toCard(leeroy({ cost: 5 })) },
    ]);
    expect(h).toEqual([['11.0.0', { cost: 4 }]]);
  });
});
