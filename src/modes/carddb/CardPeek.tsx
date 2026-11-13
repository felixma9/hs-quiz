import { createPortal } from 'react-dom';
import type { Card } from '../../lib/types';
import { drawable } from '../../pool/pool';
import { GameCard } from '../../card/GameCard';
import { ICON } from '../../app/icons';
import { layoutFor } from '../../card/layout';

const NONE = new Set<never>();
const W = 190;
const H = (W * 746) / 500;
const renderUrl = (c: Card) => `https://art.hearthstonejson.com/v1/render/latest/enUS/256x/${c.id}.png`;

/**
 * A miniature of the whole card beside the result under the mouse, with its
 * mana, attack and health shown large over the card's own gems (which are too
 * small to read at this size). Never takes the pointer, so it can't get in
 * the way of the click that opens the card.
 */
export function CardPeek({ card, anchor }: { card: Card; anchor: DOMRect }) {
  // Beside the result: right if there's room, else left; kept on screen.
  const right = anchor.right + 14 + W <= window.innerWidth - 8;
  const left = right ? anchor.right + 14 : Math.max(8, anchor.left - 14 - W);
  const top = Math.min(Math.max(8, anchor.top + anchor.height / 2 - H / 2), window.innerHeight - H - 8);
  const canDraw = drawable([card]).length > 0;
  // Weapons, heroes and locations keep their bottom-right number in health (durability) or armor.
  const br = card.type === 'HERO' ? card.armor : card.health;
  const brIcon = card.type === 'HERO' || card.type === 'LOCATION' ? ICON.armor : card.type === 'WEAPON' ? ICON.durability : ICON.health;
  // Each large stat sits centred on the card's own gem (where that is depends on the card type).
  const at = (k: 'cost' | 'attack' | 'health') => {
    const box = layoutFor(card)[k];
    return box ? { left: `${((box[0] + box[2] / 2) / 670) * 100}%`, top: `${((box[1] + box[3] / 2) / 1000) * 100}%` } : null;
  };
  const stat = (k: 'cost' | 'attack' | 'health', value: number | undefined, icon: string) => {
    const pos = at(k);
    return value != null && pos ? (
      <span className="peek-stat" style={{ ...pos, backgroundImage: `url(${icon})` }}>
        {value}
      </span>
    ) : null;
  };
  return createPortal(
    <div className="peek" style={{ left, top, width: W }} aria-hidden="true">
      <div className="peek-card">
        {canDraw ? <GameCard card={card} hidden={NONE} pool={[]} /> : <img className="peek-render" src={renderUrl(card)} alt="" />}
        {canDraw && stat('cost', card.cost, ICON.mana)}
        {canDraw && stat('attack', card.attack, card.type === 'WEAPON' ? ICON.weaponAttack : ICON.attack)}
        {canDraw && stat('health', br, brIcon)}
      </div>
    </div>,
    document.body,
  );
}
