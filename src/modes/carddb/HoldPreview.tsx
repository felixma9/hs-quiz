import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '../../lib/types';
import { drawable } from '../../pool/pool';
import { GameCard } from '../../card/GameCard';
import { MiniStandIn } from '../../app/CardTimeline';

const NONE = new Set<never>();
const renderUrl = (c: Card) => `https://art.hearthstonejson.com/v1/render/latest/enUS/512x/${c.id}.png`;

/**
 * Touch: while a result is pressed and held, a big preview of the card in the middle of the
 * screen, over the dimmed page; it goes when the finger lifts. The saved miniature shows at
 * once and the full card draws over it, sharp at this size.
 */
export function HoldPreview({ card }: { card: Card }) {
  const canDraw = drawable([card]).length > 0;
  const [drawn, setDrawn] = useState(!canDraw);
  return createPortal(
    <div className="hold-preview" aria-hidden="true">
      <div className="hold-preview-card">
        {canDraw ? <GameCard card={card} hidden={NONE} pool={[]} onDrawn={() => setDrawn(true)} /> : <img src={renderUrl(card)} alt="" />}
        {!drawn && <MiniStandIn card={card} />}
      </div>
    </div>,
    document.body,
  );
}
