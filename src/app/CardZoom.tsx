import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Card } from '../lib/types';
import { drawable } from '../pool/pool';
import { GameCard } from '../card/GameCard';

/**
 * Tap a card's round art icon to see the whole card. Any screen calls
 * zoomCard(); the one CardZoomHost in App shows it.
 */
type Zoom = { card: Card; note?: ReactNode } | null;
let show: ((z: Zoom) => void) | null = null;

export function zoomCard(card: Card, note?: ReactNode) {
  show?.({ card, note });
}

/** Props for an art icon that opens the whole card (for icons that aren't already inside a button). */
export function zoomProps(card: Card, note?: ReactNode) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': `Show ${card.name}`,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      zoomCard(card, note);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        zoomCard(card, note);
      }
    },
  } as const;
}

const NONE = new Set<never>();
const renderUrl = (c: Card) => `https://art.hearthstonejson.com/v1/render/latest/enUS/512x/${c.id}.png`;

export function CardZoomHost() {
  const [z, setZ] = useState<Zoom>(null);
  useEffect(() => {
    show = setZ;
    return () => {
      show = null;
    };
  }, []);
  useEffect(() => {
    if (!z) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZ(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [z]);
  // Our own renderer draws minions, spells, weapons and heroes; anything else uses HearthstoneJSON's render.
  const canDraw = useMemo(() => !!z && drawable([z.card]).length > 0, [z]);
  if (!z) return null;
  return (
    <div className="zoom" role="dialog" aria-modal="true" aria-label={z.card.name} onClick={() => setZ(null)}>
      <figure className="zoom-card" onClick={(e) => e.stopPropagation()}>
        {canDraw ? (
          <GameCard card={z.card} hidden={NONE} pool={[]} />
        ) : (
          <img className="zoom-render" src={renderUrl(z.card)} alt={z.card.name} />
        )}
        {z.note && <figcaption className="zoom-note">{z.note}</figcaption>}
      </figure>
      <button type="button" className="zoom-close" aria-label="Close" onClick={() => setZ(null)}>
        ✕
      </button>
    </div>
  );
}
