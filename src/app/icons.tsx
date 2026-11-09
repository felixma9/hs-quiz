/**
 * Game icons used around the site: the card-frame gems (from HearthSim's
 * Sunwell assets) and the class icons in public/class-icons.
 */
const BASE = import.meta.env.BASE_URL;

export const ICON = {
  mana: `${BASE}sunwell/cost-mana.webp`,
  attack: `${BASE}sunwell/attack-minion.webp`,
  health: `${BASE}sunwell/health.webp`,
  armor: `${BASE}sunwell/armor.webp`,
};

const RARITY_FILE: Record<string, string> = {
  FREE: 'rarity-common',
  COMMON: 'rarity-common',
  RARE: 'rarity-rare',
  EPIC: 'rarity-epic',
  LEGENDARY: 'rarity-legendary',
};
export const rarityIcon = (r: string) => `${BASE}sunwell/${RARITY_FILE[r] ?? 'rarity-common'}.webp`;
export const classIcon = (cls: string) => `${BASE}class-icons/${cls}.png`;

/** A stat drawn the way the card shows it: the number on its gem. */
export function StatGem({ kind, n }: { kind: 'mana' | 'attack' | 'health'; n: number | string }) {
  return (
    <span className={`gem-inline gem-${kind}`} aria-label={`${n} ${kind === 'mana' ? 'mana' : kind}`}>
      <img src={ICON[kind]} alt="" draggable={false} />
      <b>{n}</b>
    </span>
  );
}
