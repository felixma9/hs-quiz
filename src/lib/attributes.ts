import type { Card } from './types';
import { SETS, setName } from '../data/sets';
import { gradeEnum, gradeName, gradeNumber, gradeText, type Grade } from './grade';

export type AttrKey =
  | 'name'
  | 'type'
  | 'class'
  | 'cost'
  | 'attack'
  | 'health'
  | 'rarity'
  | 'tribe'
  | 'set'
  | 'text';

export type Kind = 'number' | 'enum' | 'name' | 'text';
export type Value = string | number | null;

export interface Attr {
  key: AttrKey;
  label: string;
  kind: Kind;
  /** The card's real value. null = this card has none (e.g. a spell's attack). */
  value(card: Card): Value;
  /** Whether Gauntlet may hide this attribute on this card. */
  hideable(card: Card): boolean;
  /** Label for this card, e.g. "Durability" for weapons. */
  labelFor?(card: Card): string;
  /** Gauntlet hiding weight. */
  weight: number;
}

const has = (v: Value) => v !== null && v !== '';

export const ATTRS: Attr[] = [
  { key: 'name', label: 'Name', kind: 'name', weight: 2, value: (c) => c.name, hideable: () => true },
  { key: 'type', label: 'Type', kind: 'enum', weight: 0.5, value: (c) => c.type, hideable: () => true },
  {
    key: 'class',
    label: 'Class',
    kind: 'enum',
    weight: 1,
    value: (c) => (c.classes ? c.classes.join(' + ') : c.cardClass),
    hideable: () => true,
  },
  { key: 'cost', label: 'Cost', kind: 'number', weight: 2, value: (c) => c.cost, hideable: () => true },
  {
    key: 'attack',
    label: 'Attack',
    kind: 'number',
    weight: 2,
    value: (c) => c.attack ?? null,
    hideable: (c) => c.attack != null,
  },
  {
    key: 'health',
    label: 'Health',
    kind: 'number',
    weight: 2,
    value: (c) => (c.type === 'HERO' ? c.armor ?? null : c.health ?? c.durability ?? null),
    hideable: (c) => has(ATTR.health.value(c)),
    labelFor: (c) =>
      c.type === 'WEAPON' || c.type === 'LOCATION' ? 'Durability' : c.type === 'HERO' ? 'Armor' : 'Health',
  },
  { key: 'rarity', label: 'Rarity', kind: 'enum', weight: 1, value: (c) => c.rarity, hideable: () => true },
  {
    key: 'tribe',
    label: 'Tribe / School',
    kind: 'enum',
    weight: 1,
    value: (c) => (c.races ? c.races.join(' + ') : c.spellSchool ?? 'NONE'),
    hideable: (c) => c.type === 'MINION' || c.type === 'SPELL',
    labelFor: (c) => (c.type === 'SPELL' ? 'Spell school' : c.type === 'MINION' ? 'Tribe' : 'Tribe / School'),
  },
  { key: 'set', label: 'Set', kind: 'enum', weight: 1, value: (c) => c.set, hideable: () => true },
  {
    key: 'text',
    label: 'Card text',
    kind: 'text',
    weight: 2.5,
    value: (c) => c.text ?? '',
    hideable: (c) => !!c.text,
  },
];

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
  if (attr === 'set') return setName(v);
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
  if (attr === 'set') {
    list.sort((a, b) => (SETS[a]?.year ?? 9999) - (SETS[b]?.year ?? 9999) || setName(a).localeCompare(setName(b)));
  } else if (attr === 'rarity') {
    const order = ['FREE', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
    list.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  } else {
    // Single values first, then combos (dual tribes, multiclass).
    list.sort((a, b) => Number(a.includes('+')) - Number(b.includes('+')) || pretty(attr, a).localeCompare(pretty(attr, b)));
    if (attr === 'tribe') list = ['NONE', ...list.filter((v) => v !== 'NONE')];
  }
  return list.map((v) => ({ value: v, label: pretty(attr, v) }));
}

const sameYear = (a: string, b: string) => SETS[a] != null && SETS[a]?.year === SETS[b]?.year;

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
      return gradeEnum(raw, String(truth), key === 'set' ? sameYear : undefined);
  }
}
