import type { Card } from './types';
import { gradeEnum, gradeName, gradeNumber, gradeText, type Grade } from './grade';

/**
 * What the player can be asked. Type is not here: the card frame shows it.
 * Set is not here either (nobody remembers sets); it is a menu filter instead.
 */
export type AttrKey = 'name' | 'class' | 'cost' | 'attack' | 'health' | 'rarity' | 'tribe' | 'text';

export type Kind = 'number' | 'enum' | 'name' | 'text';
export type Value = string | number | null;

export interface Attr {
  key: AttrKey;
  label: string;
  kind: Kind;
  /** The card's real value. null = this card has none (e.g. a spell's attack). */
  value(card: Card): Value;
  /** Whether this attribute exists on this card (Cardle asks only these). */
  applies(card: Card): boolean;
  /** Whether Gauntlet may hide this attribute on this card. */
  hideable(card: Card): boolean;
  /** Label for this card, e.g. "Durability" for weapons. */
  labelFor?(card: Card): string;
  /** Gauntlet hiding weight. */
  weight: number;
}

const has = (v: Value) => v !== null && v !== '';

export const ATTRS: Attr[] = [
  { key: 'name', label: 'Name', kind: 'name', weight: 2, value: (c) => c.name, applies: () => true, hideable: () => true },
  {
    key: 'class',
    label: 'Class',
    kind: 'enum',
    weight: 1,
    value: (c) => (c.classes ? c.classes.join(' + ') : c.cardClass),
    applies: () => true,
    hideable: () => true,
  },
  { key: 'cost', label: 'Cost', kind: 'number', weight: 2, value: (c) => c.cost, applies: () => true, hideable: () => true },
  {
    key: 'attack',
    label: 'Attack',
    kind: 'number',
    weight: 2,
    value: (c) => c.attack ?? null,
    applies: (c) => c.attack != null,
    hideable: (c) => c.attack != null,
  },
  {
    key: 'health',
    label: 'Health',
    kind: 'number',
    weight: 2,
    value: (c) => (c.type === 'HERO' ? c.armor ?? null : c.health ?? c.durability ?? null),
    applies: (c) => has(ATTR.health.value(c)),
    hideable: (c) => has(ATTR.health.value(c)),
    labelFor: (c) =>
      c.type === 'WEAPON' || c.type === 'LOCATION' ? 'Durability' : c.type === 'HERO' ? 'Armor' : 'Health',
  },
  { key: 'rarity', label: 'Rarity', kind: 'enum', weight: 1, value: (c) => c.rarity, applies: () => true, hideable: () => true },
  {
    key: 'tribe',
    label: 'Tribe / School',
    kind: 'enum',
    weight: 1,
    value: (c) => (c.races ? c.races.join(' + ') : c.spellSchool ?? 'NONE'),
    applies: (c) => c.type === 'MINION' || c.type === 'SPELL',
    hideable: (c) => c.type === 'MINION' || c.type === 'SPELL',
    labelFor: (c) => (c.type === 'SPELL' ? 'Spell school' : c.type === 'MINION' ? 'Tribe' : 'Tribe / School'),
  },
  {
    key: 'text',
    label: 'Card text',
    kind: 'text',
    weight: 2.5,
    value: (c) => plainText(c.text),
    applies: () => true,
    hideable: (c) => !!c.text,
  },
];

/** Card text without the <b>/<i> tags kept for drawing. */
export function plainText(t: string | undefined): string {
  return (t ?? '').replace(/<\/?[bi]>/g, '');
}

export const ATTR = Object.fromEntries(ATTRS.map((a) => [a.key, a])) as Record<AttrKey, Attr>;

export function labelFor(attr: Attr, card?: Card): string {
  return card && attr.labelFor ? attr.labelFor(card) : attr.label;
}

const PRETTY: Record<string, string> = {
  DEMONHUNTER: 'Demon Hunter',
  DEATHKNIGHT: 'Death Knight',
  MECHANICAL: 'Mech',
  NONE: 'None',
  ALL: 'All (Amalgam)',
};

const title = (s: string) =>
  s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** Human-readable form of a stored value. */
export function pretty(attr: AttrKey, v: Value): string {
  if (v === null || v === '') return '—';
  if (typeof v === 'number') return String(v);
  if (attr === 'name' || attr === 'text') return v;
  return v
    .split(' + ')
    .map((p) => PRETTY[p] ?? title(p))
    .join(' + ');
}

/** Distinct values of an enum attribute in the pool, for drop-downs. */
export function enumOptions(attr: AttrKey, cards: Card[]): { value: string; label: string }[] {
  const vals = new Set<string>();
  for (const c of cards) {
    const v = ATTR[attr].value(c);
    if (typeof v === 'string') vals.add(v);
  }
  if (attr === 'tribe') vals.add('NONE');
  let list = [...vals];
  if (attr === 'rarity') {
    const order = ['FREE', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
    list.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  } else {
    // Single values first, then combos (dual tribes, multiclass).
    list.sort((a, b) => Number(a.includes('+')) - Number(b.includes('+')) || pretty(attr, a).localeCompare(pretty(attr, b)));
    if (attr === 'tribe') list = ['NONE', ...list.filter((v) => v !== 'NONE')];
  }
  return list.map((v) => ({ value: v, label: pretty(attr, v) }));
}

/**
 * Grade a raw input against a card. Raw input is always a string from a form
 * field; an empty number field means "none".
 */
export function gradeAttr(key: AttrKey, raw: string, card: Card): Grade {
  const attr = ATTR[key];
  const truth = attr.value(card);
  switch (attr.kind) {
    case 'number': {
      const g = raw.trim() === '' ? null : Number(raw);
      return gradeNumber(Number.isFinite(g) ? g : null, truth as number | null);
    }
    case 'name':
      return gradeName(raw, String(truth));
    case 'text':
      return gradeText(raw, String(truth ?? ''));
    case 'enum':
      return gradeEnum(raw, String(truth));
  }
}
