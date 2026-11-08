export interface Card {
  id: string;
  dbfId: number;
  name: string;
  type: 'MINION' | 'SPELL' | 'WEAPON' | 'HERO' | 'LOCATION';
  cardClass: string;
  classes?: string[];
  cost: number;
  attack?: number;
  health?: number;
  durability?: number;
  armor?: number;
  rarity: string;
  set: string;
  races?: string[];
  spellSchool?: string;
  text?: string;
  /** Player-facing keywords (Taunt, Battlecry...). */
  keywords?: string[];
  flavor?: string;
}
