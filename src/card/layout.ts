import type { Card } from '../lib/types';
import type { AttrKey } from '../lib/attributes';

/** [x, y, width, height] in Sunwell's 670 x 1000 reference space. */
export type Box = [number, number, number, number];
const REF_W = 670;
const REF_H = 1000;

const COST: Box = [47, 105, 140, 144];

/** Where each tappable part of the card is, per card type (from Sunwell's own coordinates). */
const LAYOUT: Record<string, Partial<Record<AttrKey, Box>>> = {
  MINION: {
    cost: COST,
    attack: [36, 721, 154, 173],
    health: [504, 728, 109, 164],
    rarity: [270, 528, 134, 85],
    name: [96, 462, 485, 75],
    text: [150, 622, 368, 160],
    tribe: [180, 785, 310, 72],
  },
  SPELL: {
    cost: COST,
    rarity: [272, 541, 116, 77],
    name: [80, 457, 507, 84],
    text: [150, 630, 366, 160],
    tribe: [180, 800, 310, 72],
  },
  WEAPON: {
    cost: COST,
    attack: [65, 753, 135, 133],
    health: [501, 744, 126, 140],
    rarity: [302, 520, 96, 90],
    name: [87, 462, 514, 66],
    text: [150, 628, 380, 168],
  },
  // Locations: Sunwell's hero card with our location layout (src/card/location.ts).
  LOCATION: {
    cost: COST,
    // Where the durability shield is actually drawn (measured from the drawn card: Sunwell's hero card places its armor gem itself).
    health: [496, 752, 115, 135],
    rarity: [288, 565, 70, 70],
    name: [88, 486, 490, 72],
    text: [150, 642, 352, 168],
  },
  HERO: {
    cost: COST,
    health: [498, 752, 115, 135],
    rarity: [300, 522, 70, 70],
    name: [91, 456, 490, 72],
    text: [150, 627, 366, 168],
  },
};

export const layoutFor = (card: Card) => LAYOUT[card.type] ?? {};

export const boxStyle = ([x, y, w, h]: Box): React.CSSProperties => ({
  left: `${(x / REF_W) * 100}%`,
  top: `${(y / REF_H) * 100}%`,
  width: `${(w / REF_W) * 100}%`,
  height: `${(h / REF_H) * 100}%`,
});
