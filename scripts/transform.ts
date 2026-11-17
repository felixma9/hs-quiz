import type { Card } from '../src/lib/types';

/** Raw record from HearthstoneJSON (only the fields we read). */
export interface RawCard {
  id: string;
  dbfId: number;
  name: string;
  type: string;
  set: string;
  rarity?: string;
  cardClass?: string;
  /** Older builds (before 2016) name the class this. */
  playerClass?: string;
  classes?: string[];
  cost?: number;
  attack?: number;
  health?: number;
  durability?: number;
  armor?: number;
  races?: string[];
  race?: string;
  spellSchool?: string;
  text?: string;
  flavor?: string;
  countAsCopyOfDbfId?: number;
  mechanics?: string[];
  collectible?: boolean;
}

/** Player-facing keywords, keyed by how they're written in bold card text (lowercase). */
const KEYWORDS: Record<string, string> = Object.fromEntries(
  [
    'Battlecry', 'Deathrattle', 'Taunt', 'Rush', 'Charge', 'Discover', 'Divine Shield', 'Lifesteal', 'Stealth', 'Combo',
    'Dormant', 'Reborn', 'Poisonous', 'Venomous', 'Spellburst', 'Elusive', 'Spell Damage', 'Windfury', 'Mega-Windfury',
    'Overload', 'Choose One', 'Immune', 'Freeze', 'Magnetic', 'Tradeable', 'Outcast', 'Kindred', 'Corrupt', 'Silence',
    'Inspire', 'Miniaturize', 'Starship Piece', 'Frenzy', 'Start of Game', 'Adapt', 'Forge', 'Dredge', 'Titan',
    'Rewind', 'Honorable Kill', 'Colossal', 'Finale', 'Imbue', 'Echo', 'Overkill', 'Excavate', 'Herald', 'Recruit',
    'Assemble', 'Overheal', 'Quickdraw', 'Gigantify', 'Infuse', 'Manathirst', 'Secret', 'Corpse', 'Jade Golem', 'Lackey',
    'Dark Gift', 'Bonus Effect', 'Spare Part', 'Invoke', 'Prepare', 'Temporary', 'Enrage', 'Sidequest', 'Questline',
    'Twinspell', 'Cleave', 'Shatter', 'Paired', 'Spellcraft', 'Tourist', 'Threat', 'Tradeable', 'Trinket',
  ].map((k) => [k.toLowerCase(), k]),
);
/** Other spellings in bold text -> keyword. */
const KEYWORD_ALIASES: Record<string, string> = {
  battlecries: 'Battlecry', deathrattles: 'Deathrattle', secrets: 'Secret', corpses: 'Corpse', frozen: 'Freeze',
  overloaded: 'Overload', excavated: 'Excavate', 'bonus effects': 'Bonus Effect', 'jade golems': 'Jade Golem',
  lackeys: 'Lackey', 'spare parts': 'Spare Part', 'starship pieces': 'Starship Piece', starship: 'Starship Piece',
  silenced: 'Silence', 'divine shields': 'Divine Shield', 'dark gifts': 'Dark Gift', imbued: 'Imbue', forged: 'Forge',
  infused: 'Infuse', corrupted: 'Corrupt', dredged: 'Dredge', 'mega windfury': 'Mega-Windfury',
};
/** Keywords only present as mechanic tags on older cards. */
const KEYWORD_MECHANICS: Record<string, string> = { ENRAGED: 'Enrage', INSPIRE: 'Inspire', JADE_GOLEM: 'Jade Golem' };

/**
 * Triggers written in plain text, not bold: "At the end of your turn", "At the start of each turn".
 * One-off delays ("at the start of your next turn", "at the end of this turn") don't count.
 */
const TURN_TRIGGER = /\bat the (start|end) of (?:your|each|their|your opponent's) turns?\b/gi;
/** "Whenever ..." and "After ..." triggers, when they start a sentence (mid-sentence, they're mostly given to something else). */
const EVENT_TRIGGER = /(?:^|[.:!]\s*)(Whenever|After)\b/g;

/** The card's keywords, from its bold text (plus a few mechanic tags and turn triggers). */
export function keywordsOf(rawText: string | undefined, mechanics: string[] = []): string[] {
  const out = new Set<string>();
  // Raw text starts some cards with an [x] layout marker, joins words with non-breaking spaces
  // ("Divine\u00a0Shield") and wraps lines inside bold text.
  const text = (rawText ?? '').split('@')[0].replace(/\[x\]/gi, '').replace(/\s+/g, ' ').trim();
  for (const m of text.matchAll(/<b>(.*?)<\/b>/g)) {
    const bold = m[1].replace(/<\/?[bi]>/g, '');
    // "Battlecry and Deathrattle", "Battlecry: Discover", "Spell Damage +1", "Infuse (3)", "Choose One -"
    for (const part of bold.split(/\s+and\s+|:|,/)) {
      const k = part
        .replace(/\(.*?\)/g, '')
        .replace(/[+-]?\$?\d+/g, '')
        .replace(/[\s\-–.!]+$/g, '')
        .trim()
        .toLowerCase();
      const name = KEYWORDS[k] ?? KEYWORD_ALIASES[k];
      if (name) out.add(name);
    }
  }
  for (const mech of mechanics) if (KEYWORD_MECHANICS[mech]) out.add(KEYWORD_MECHANICS[mech]);
  const plain = text.replace(/<\/?[bi]>/g, '');
  for (const m of plain.matchAll(TURN_TRIGGER)) out.add(m[1].toLowerCase() === 'start' ? 'Start of Turn' : 'End of Turn');
  // Shown as "Whenever…" / "After…" so they don't read as keywords of their own.
  for (const m of plain.matchAll(EVENT_TRIGGER)) out.add(`${m[1]}…`);
  return [...out].sort();
}

const TYPES = new Set(['MINION', 'SPELL', 'WEAPON', 'HERO', 'LOCATION']);
/** Sets that only hold copies of other cards (or skins). */
const EXCLUDED_SETS = new Set(['VANILLA', 'CORE_HIDDEN', 'HERO_SKINS']);
/** Sets that mostly reprint older cards; a copy elsewhere wins. */
const REPRINT_SETS = new Set(['CORE']);

/**
 * Turn card markup into clean text. Keeps <b>/<i> (for drawing the card)
 * unless keepTags is false; grading strips them with plainText().
 */
export function cleanText(raw: string | undefined, keepTags = true): string {
  if (!raw) return '';
  // Cards that change in play list their text variants after '@' ("base@(3 left!)@(Ready!)"),
  // and a few join them with a digit instead ("...(Upgrades each turn!)</i>1Deal ...").
  // Keep the first: the card's text as you first see it.
  let s = raw.split('@')[0].split(/(?<=[)!.>])\d(?=[A-Z<])/)[0];
  s = s.replace(/\|4\(([^,()]*),([^()]*)\)/g, '$2').replace(/\[x\]/gi, '');
  s = keepTags ? s.replace(/<(?!\/?[bi]>)[^>]*>/gi, '').replace(/<(\/?)I>/g, '<$1i>') : s.replace(/<\/?[a-z]+>/gi, '');
  return s
    .replace(/(?<=[a-z])\{\d+\}/g, '')
    .replace(/\$?\{\d+\}/g, 'X')
    .replace(/[$#](\d)/g, '$1')
    .replace(/@/g, '')
    .replace(/~[A-Z].*$/s, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, ' ')
    .replace(/[ _\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,:;!?)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
}

export function slim(r: RawCard): Card {
  const c: Card = {
    id: r.id,
    dbfId: r.dbfId,
    name: r.name,
    type: r.type as Card['type'],
    cardClass: r.cardClass ?? 'NEUTRAL',
    cost: r.cost ?? 0,
    rarity: r.rarity ?? 'FREE',
    set: r.set,
  };
  if (r.classes && r.classes.length > 1) c.classes = [...r.classes].sort();
  if (r.attack != null) c.attack = r.attack;
  if (r.health != null) c.health = r.health;
  if (r.durability) c.durability = r.durability;
  if (r.armor != null) c.armor = r.armor;
  const races = r.races ?? (r.race ? [r.race] : undefined);
  if (races && races.length) c.races = [...races].sort();
  if (r.spellSchool) c.spellSchool = r.spellSchool;
  const text = cleanText(r.text);
  if (text) c.text = text;
  const keywords = keywordsOf(r.text, r.mechanics);
  if (keywords.length) c.keywords = keywords;
  const flavor = cleanText(r.flavor, false);
  if (flavor) c.flavor = flavor;
  return c;
}

/** Game tags that name another card the game shows with this one, in the order they're listed. */
const RELATED_TAGS = ['COLLECTION_RELATED_CARD_DATABASE_ID', 'QUEST_REWARD_DATABASE_ID', 'QUESTLINE_FINAL_REWARD_DATABASE_ID', 'HERO_POWER'];

/**
 * From the game's CardDefs.xml (HearthSim/hsdata): each card's related cards, by dbfId.
 * A plain scan rather than an XML parser: the file is 70 MB and we read four tags.
 */
export function relatedFromDefs(xml: string): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const entity = /<Entity\b[^>]*\bID="(\d+)"[^>]*>([\s\S]*?)<\/Entity>/g;
  const tag = /<Tag\b[^>]*\bname="([A-Z_]+)"[^>]*\bvalue="(\d+)"/g;
  for (const [, id, body] of xml.matchAll(entity)) {
    const found: [number, number][] = [];
    for (const [, name, value] of body.matchAll(tag)) {
      const order = RELATED_TAGS.indexOf(name);
      if (order >= 0 && value !== '0') found.push([order, Number(value)]);
    }
    if (found.length) out.set(Number(id), [...new Set(found.sort((a, b) => a[0] - b[0]).map(([, v]) => v))]);
  }
  return out;
}

/** Types a related card can be (enchantments, the odd quest reward, aren't cards to show). */
const TOKEN_TYPES = new Set([...TYPES, 'HERO_POWER']);

/** Sets whose cards are never what a constructed card makes (Battlegrounds, Mercenaries, adventure bosses...). */
const NOT_TOKEN_SETS = new Set(['BATTLEGROUNDS', 'LETTUCE', 'TB', 'HERO_SKINS', 'BOSS', 'CREDITS', 'MISSIONS', 'TAVERNS_OF_TIME', 'PLACEHOLDER_202204']);
const statsOf = (r: RawCard) => (r.type === 'MINION' ? r.health : r.type === 'WEAPON' ? r.durability : undefined);

/**
 * Cards the text makes with a stat line: "Summon a 1/1 Whelp", "Equip a 5/3 Ashbringer",
 * "Summon two 3/6 Water Elementals". The name after the stats is looked up among minions and
 * weapons with those stats (the longest name that fits; plurals allowed). When the text uses a
 * short name ("Summon a 2/2 Satyr" for Illidari Satyr), the card's own token with those stats
 * (its id plus t: BT_352 -> BT_352t) is used instead. Copies ("a 1/1 copy of it") and lines that
 * fit neither are skipped. Returns, per card id, the raw cards found, in text order.
 */
export function statLineRelated(cards: Card[], all: RawCard[]): Map<string, RawCard[]> {
  const pool = all.filter(
    (r) =>
      (r.type === 'MINION' || r.type === 'WEAPON') &&
      r.attack != null &&
      statsOf(r) != null &&
      !NOT_TOKEN_SETS.has(r.set) &&
      !Object.keys(r).some((k) => /^(battlegrounds|isBattlegrounds|mercenaries)/.test(k)),
  );
  const byStats = new Map<string, Map<string, RawCard[]>>();
  const family = new Map<string, RawCard[]>();
  for (const r of pool) {
    const key = `${r.attack}/${statsOf(r)}`;
    const names = byStats.get(key) ?? byStats.set(key, new Map()).get(key)!;
    const name = r.name.toLowerCase();
    names.set(name, [...(names.get(name) ?? []), r]);
    const base = !r.collectible && /^(.+?)t\d*[a-z]?$/.exec(r.id)?.[1];
    if (base) family.set(base, [...(family.get(base) ?? []), r]);
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = new Map<string, RawCard[]>();
  for (const c of cards) {
    const text = (c.text ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    const found: RawCard[] = [];
    for (const m of text.matchAll(/(\d+)\/(\d+) /g)) {
      const key = `${m[1]}/${m[2]}`;
      const rest = text.slice(m.index! + m[0].length).toLowerCase();
      const names = [...(byStats.get(key)?.keys() ?? [])].sort((a, b) => b.length - a.length);
      const name = names.find((n) => new RegExp(`^${esc(n)}(e?s)?\\b`).test(rest));
      let hits: RawCard[];
      if (name && name !== c.name.toLowerCase()) {
        // The copy from the card's own set, then a token over a collectible card.
        hits = [...byStats.get(key)!.get(name)!].sort(
          (a, b) => Number(a.set !== c.set) - Number(b.set !== c.set) || Number(!!a.collectible) - Number(!!b.collectible),
        );
      } else {
        hits = (family.get(c.id.replace(/^CORE_/, '')) ?? []).filter((r) => `${r.attack}/${statsOf(r)}` === key);
        if (hits.length !== 1) continue;
      }
      if (hits[0].name !== c.name && !found.includes(hits[0])) found.push(hits[0]);
    }
    if (found.length) out.set(c.id, found);
  }
  return out;
}

/**
 * Give each card its related cards (from relatedFromDefs, then statLineRelated) and return the
 * ones that aren't collectible as tokens. `all` is HearthstoneJSON's full card list (tokens included);
 * `copies` lists, for each card, the dbfIds of every copy of it (reprints share the tag).
 */
export function attachRelated(cards: Card[], all: RawCard[], related: Map<number, number[]>, copies: Map<string, number[]>): Card[] {
  const rawByDbf = new Map(all.map((r) => [r.dbfId, r]));
  const byName = new Map(cards.map((c) => [`${c.type}|${c.name.toLowerCase()}`, c]));
  const tokens = new Map<string, Card>();
  const fromText = statLineRelated(cards, all);
  for (const c of cards) {
    const dbfs = (copies.get(c.id) ?? [c.dbfId]).map((d) => related.get(d)).find((r) => r?.length) ?? [];
    const ids: string[] = [];
    const names = new Set<string>();
    const fromGame = dbfs.map((d) => rawByDbf.get(d)).filter((r): r is RawCard => !!r);
    // A stat line the game data already covers (a card with the same stats) keeps the game's choice:
    // Living Mana's "2/2 Treants" are its Mana Treants, not the plain Treant.
    const gameStats = new Set(fromGame.map((r) => `${r.attack}/${statsOf(r)}`));
    const raws = [...fromGame, ...(fromText.get(c.id) ?? []).filter((r) => !gameStats.has(`${r.attack}/${statsOf(r)}`))];
    for (const r of raws) {
      if (!r || !TOKEN_TYPES.has(r.type)) continue;
      // A collectible card links to our copy of it (a reprint's link may name another copy).
      const same = byName.get(`${r.type}|${r.name.toLowerCase()}`);
      const id = r.collectible && same ? same.id : r.id;
      // Once per name: the game data and the text can name different copies of the same token.
      if (id === c.id || ids.includes(id) || names.has(r.name)) continue;
      names.add(r.name);
      // Not collectible: a token (even one named like a collectible card, as Druid of the Fang's 7/7 form is).
      if (id === r.id && !r.collectible) tokens.set(r.id, slim({ ...r, rarity: r.rarity ?? 'FREE' }));
      ids.push(id);
    }
    if (ids.length) c.related = ids;
  }
  return [...tokens.values()].sort((a, b) => a.dbfId - b.dbfId);
}

/** Every copy of each built card, by its id: the card itself, its reprints and countAsCopyOf copies. */
export function copiesOf(raw: RawCard[], cards: Card[]): Map<string, number[]> {
  const byName = new Map(cards.map((c) => [`${c.type}|${c.name.toLowerCase()}`, c]));
  const byDbf = new Map(cards.map((c) => [c.dbfId, c]));
  const out = new Map<string, number[]>(cards.map((c) => [c.id, [c.dbfId]]));
  for (const r of raw) {
    const c = (r.countAsCopyOfDbfId && byDbf.get(r.countAsCopyOfDbfId)) || byName.get(`${r.type}|${r.name.toLowerCase()}`);
    if (c && c.dbfId !== r.dbfId) out.get(c.id)!.push(r.dbfId);
  }
  return out;
}

/** Filter to playable collectible cards and keep one copy of each. */
export function buildCards(raw: RawCard[]): Card[] {
  const keep = raw.filter(
    (r) =>
      r.collectible !== false &&
      TYPES.has(r.type) &&
      !EXCLUDED_SETS.has(r.set) &&
      r.cost != null &&
      !(r.type === 'HERO' && !r.text),
  );
  const byDbf = new Set(keep.map((r) => r.dbfId));
  const groups = new Map<string, RawCard[]>();
  for (const r of keep) {
    if (r.countAsCopyOfDbfId && byDbf.has(r.countAsCopyOfDbfId)) continue;
    const key = `${r.type}|${r.name.toLowerCase()}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  const out: Card[] = [];
  for (const g of groups.values()) {
    g.sort(
      (a, b) =>
        Number(REPRINT_SETS.has(a.set)) - Number(REPRINT_SETS.has(b.set)) ||
        a.dbfId - b.dbfId,
    );
    out.push(slim(g[0]));
  }
  out.sort((a, b) => a.dbfId - b.dbfId);
  return out;
}
