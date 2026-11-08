import { describe, expect, it } from 'vitest';
import { buildCards, cleanText, type RawCard } from '../scripts/transform';

const base = { collectible: true, rarity: 'FREE', cardClass: 'MAGE', cost: 4 };

describe('cleanText', () => {
  it('strips markup and placeholders', () => {
    expect(cleanText('<b>Battlecry:</b> Deal $2 damage.')).toBe('<b>Battlecry:</b> Deal 2 damage.');
    expect(cleanText('<b>Battlecry:</b> Deal $2 damage.', false)).toBe('Battlecry: Deal 2 damage.');
    expect(cleanText('[x]<b>Taunt</b>\nGain #3 Armor.', false)).toBe('Taunt Gain 3 Armor.');
    expect(cleanText('Battlecry:& Equip a 3/8 Blood Fury.~GAMEPLAY ASPROXY EX1 323')).toBe('Battlecry: Equip a 3/8 Blood Fury.');
  });
  it('keeps only the first text variant', () => {
    expect(cleanText('Draw a card for each minion that died this turn.@ <i>(@)</i>')).toBe('Draw a card for each minion that died this turn.');
    expect(cleanText('<b>Battlecry:</b> Fill your hand. <i>({0} left!)</i>@<b>Battlecry:</b> Fill your hand. <i>(Ready!)</i>@x')).toBe(
      '<b>Battlecry:</b> Fill your hand. <i>(X left!)</i>',
    );
    expect(cleanText('Deal ${0} damage. <i>(Upgrades each turn!)</i>1Deal ${0} damage.')).toBe('Deal X damage. <i>(Upgrades each turn!)</i>');
    expect(cleanText('Choose {0} |4(Cataclysm,Cataclysms) to unleash!')).toBe('Choose X Cataclysms to unleash!');
  });
});

describe('buildCards', () => {
  it('keeps one copy, preferring the original over a Core reprint', () => {
    const raw: RawCard[] = [
      { ...base, id: 'CORE_CS2_029', dbfId: 69501, name: 'Fireball', type: 'SPELL', set: 'CORE', text: 'Deal $6 damage.' },
      { ...base, id: 'CS2_029', dbfId: 315, name: 'Fireball', type: 'SPELL', set: 'LEGACY', text: 'Deal $6 damage.' },
      { ...base, id: 'VAN_CS2_029', dbfId: 68326, name: 'Fireball', type: 'SPELL', set: 'VANILLA', text: 'Deal $6 damage.' },
      { ...base, id: 'HERO_08', dbfId: 1, name: 'Jaina', type: 'HERO', set: 'HERO_SKINS' },
      { ...base, id: 'X', dbfId: 2, name: 'Coin', type: 'SPELL', set: 'CORE', cost: undefined },
    ];
    const cards = buildCards(raw);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('CS2_029');
    expect(cards[0].text).toBe('Deal 6 damage.');
  });
});
