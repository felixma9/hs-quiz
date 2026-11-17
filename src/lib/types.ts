export interface Card {
  id: string;
  dbfId: number;
  name: string;
  /** HERO_POWER only on tokens (public/tokens.json): a hero card's power or a quest's reward. */
  type: 'MINION' | 'SPELL' | 'WEAPON' | 'HERO' | 'LOCATION' | 'HERO_POWER';
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
  /**
   * Cards the game itself shows with this one (Onyxia: Whelp, Tirion: Ashbringer, a quest: its reward,
   * a hero card: its power), by id: other cards in cards.json, or tokens in tokens.json.
   */
  related?: string[];
}
