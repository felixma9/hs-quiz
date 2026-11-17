import { describe, expect, it } from 'vitest';
import { attachRelated, buildCards, cleanText, copiesOf, keywordsOf, relatedFromDefs, statLineRelated, type RawCard } from '../scripts/transform';

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

describe('keywordsOf', () => {
  it('reads keywords from bold text', () => {
    expect(keywordsOf('<b>Charge</b>. <b>Battlecry:</b> Summon two 1/1 Whelps.')).toEqual(['Battlecry', 'Charge']);
    expect(keywordsOf('<b>Battlecry and Deathrattle:</b> Deal 2.')).toEqual(['Battlecry', 'Deathrattle']);
    expect(keywordsOf('<b>Spell Damage +1</b>. <b>Infuse (3):</b> Gain <b>Taunt</b>.')).toEqual(['Infuse', 'Spell Damage', 'Taunt']);
  });
  it('ignores bold card names and Legendary', () => {
    expect(keywordsOf("Add a <b>Legendary</b> minion and a <b>Fireball</b>.")).toEqual([]);
  });
  it('adds keywords from old mechanic tags', () => {
    expect(keywordsOf('<b>Enrage:</b> +3 Attack', ['ENRAGED'])).toEqual(['Enrage']);
  });
  it('reads keywords split by non-breaking spaces or line breaks', () => {
    expect(keywordsOf('Give a minion <b>Divine\u00a0Shield</b>.\nDraw a card.')).toEqual(['Divine Shield']);
    expect(keywordsOf('Give adjacent\u00a0minions <b>Spell\u00a0Damage +1</b>.')).toEqual(['Spell Damage']);
    expect(keywordsOf('[x]<b>Battlecry:</b> Choose a\nflightpath and go <b>Dormant.\n</b> Awaken')).toEqual(['Battlecry', 'Dormant']);
  });
  it('finds start and end of turn triggers in plain text', () => {
    expect(keywordsOf('<b>Taunt</b>. At the end of your turn, restore 3 Health.')).toEqual(['End of Turn', 'Taunt']);
    expect(keywordsOf('At the start of each turn, draw a card.')).toEqual(['Start of Turn']);
    expect(keywordsOf('At the start of your next turn, draw 2.')).toEqual([]);
    expect(keywordsOf('Gain +2 Attack until the end of this turn.')).toEqual([]);
  });
  it('finds Whenever and After triggers that start a sentence', () => {
    expect(keywordsOf('Whenever you cast a spell, gain +2 Attack.')).toEqual(['Whenever…']);
    expect(keywordsOf('[x]After your hero attacks,\nyour Cannoneers FIRE!')).toEqual(['After…']);
    expect(keywordsOf('<b>Secret:</b> After your opponent plays a minion, summon a copy.')).toEqual(['After…', 'Secret']);
    expect(keywordsOf('<b>Taunt</b>. After a friendly minion dies, draw a card.')).toEqual(['After…', 'Taunt']);
    expect(keywordsOf('Give a minion "Whenever this attacks, draw a card."')).toEqual([]);
  });
});

describe('related cards', () => {
  const defs = `<CardDefs>
<Entity CardID="EX1_562" ID="363" version="2"><Tag enumID="45" name="HEALTH" type="Int" value="8"/><Tag enumID="2" name="COLLECTION_RELATED_CARD_DATABASE_ID" type="Int" value="54"/></Entity>
<Entity CardID="CORE_EX1_383" ID="69613" version="2"><Tag enumID="2" name="COLLECTION_RELATED_CARD_DATABASE_ID" type="Int" value="1730"/></Entity>
<Entity CardID="NEW1_030" ID="474" version="2"><Tag enumID="45" name="HEALTH" type="Int" value="12"/></Entity>
</CardDefs>`;
  const raw = (r: Partial<RawCard>): RawCard => ({ set: 'EXPERT1', rarity: 'LEGENDARY', type: 'MINION', cost: 9, collectible: true, ...r }) as RawCard;
  const collectible = [
    raw({ id: 'EX1_562', dbfId: 363, name: 'Onyxia' }),
    raw({ id: 'EX1_383', dbfId: 890, name: 'Tirion Fordring' }),
    raw({ id: 'CORE_EX1_383', dbfId: 69613, name: 'Tirion Fordring', set: 'CORE' }),
    raw({ id: 'NEW1_030', dbfId: 474, name: 'Deathwing' }),
  ];
  const all = [
    ...collectible,
    raw({ id: 'ds1_whelptoken', dbfId: 54, name: 'Whelp', collectible: undefined, rarity: undefined, cost: 1, attack: 1, health: 1, set: 'EXPERT1' }),
    raw({ id: 'EX1_383t', dbfId: 1730, name: 'Ashbringer', type: 'WEAPON', collectible: undefined, cost: 5 }),
  ];
  it('reads the related tags from the game data', () => {
    expect(relatedFromDefs(defs)).toEqual(new Map([[363, [54]], [69613, [1730]]]));
  });
  it('links cards to tokens, through a reprint when the card itself has no link', () => {
    const cards = buildCards(collectible);
    const tokens = attachRelated(cards, all, relatedFromDefs(defs), copiesOf(collectible, cards));
    expect(cards.find((c) => c.name === 'Onyxia')!.related).toEqual(['ds1_whelptoken']);
    expect(cards.find((c) => c.name === 'Tirion Fordring')!.related).toEqual(['EX1_383t']);
    expect(cards.find((c) => c.name === 'Deathwing')!.related).toBeUndefined();
    expect(tokens.map((t) => [t.name, t.rarity])).toEqual([['Whelp', 'FREE'], ['Ashbringer', 'LEGENDARY']]);
  });
});

describe('stat line related cards', () => {
  const raw = (r: Partial<RawCard>): RawCard => ({ set: 'EXPERT1', rarity: 'COMMON', type: 'MINION', cost: 3, collectible: true, ...r }) as RawCard;
  const all = [
    raw({ id: 'CS2_033', dbfId: 1, name: 'Water Elemental', attack: 3, health: 6 }),
    raw({ id: 'BT_352t', dbfId: 2, name: 'Illidari Satyr', attack: 2, health: 2, collectible: undefined, set: 'BLACK_TEMPLE' }),
    raw({ id: 'X_tre1', dbfId: 3, name: 'Treant', attack: 2, health: 2, collectible: undefined, set: 'UNGORO' }),
    raw({ id: 'X_tre2', dbfId: 4, name: 'Treant', attack: 2, health: 2, collectible: undefined, set: 'EXPERT1' }),
  ];
  const card = (id: string, name: string, text: string, set = 'EXPERT1') =>
    buildCards([raw({ id, dbfId: 100 + id.length, name, text, set, type: 'SPELL' })])[0];
  const find = (c: ReturnType<typeof card>) => statLineRelated([c], all).get(c.id)?.map((r) => r.id);
  it('finds the card named after the stats, plural too', () => {
    expect(find(card('DF', 'Deep Freeze', '<b>Freeze</b> an enemy. Summon two 3/6 Water Elementals.'))).toEqual(['CS2_033']);
  });
  it("prefers the copy from the card's own set", () => {
    expect(find(card('LM', 'Living Mana', 'Summon two 2/2 Treants.', 'UNGORO'))).toEqual(['X_tre1']);
  });
  it("uses the card's own token when the text gives a short name", () => {
    expect(find(card('BT_352', 'Satyr Overseer', 'After your hero attacks, summon a 2/2 Satyr.', 'BLACK_TEMPLE'))).toEqual(['BT_352t']);
  });
  it('skips copies and unknown names', () => {
    expect(find(card('SH', 'Shadowcaster', 'Add a 1/1 copy of it to your hand.'))).toBeUndefined();
  });
});
