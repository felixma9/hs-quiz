import { useEffect, useState } from 'react';
import type { Card } from '../lib/types';
import { isCollectible, relatedCards } from '../lib/cards';
import { Art, useArtCrop } from '../modes/hsdle/Art';
import { zoomCard } from './CardZoom';

/**
 * The cards the game shows with this one (a token it summons, a quest's reward, a hero's power),
 * as art icons under the zoomed card. Tapping one opens it in its place: a collectible card with
 * its history, a token on its own, with this card at the top to go back to.
 */
export function RelatedCards({ card, trail }: { card: Card; trail: Card[] }) {
  const crop = useArtCrop();
  const [list, setList] = useState<Card[]>([]);
  useEffect(() => {
    let live = true;
    setList([]);
    void relatedCards(card).then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, [card]);
  if (!list.length) return null;
  return (
    <div className="related" onClick={(e) => e.stopPropagation()}>
      <span className="related-label">Related</span>
      <ul>
        {list.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={(e) => {
                const from = e.currentTarget.querySelector('.art-crop')?.getBoundingClientRect();
                // The card it came from goes on the trail, so the related card has a way back to it.
                const back = [...trail, card];
                zoomCard(r, undefined, isCollectible(r) ? { history: true, from, back } : { back });
              }}
            >
              <Art card={r} crop={crop} className="related-art" />
              <span>{r.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Under a card opened from Related, where its own Related would be: the card it was opened from, to go back to. */
export function BackTo({ trail }: { trail: Card[] }) {
  const crop = useArtCrop();
  const prev = trail[trail.length - 1];
  return (
    <button
      type="button"
      className="zoom-back"
      onClick={(e) => {
        e.stopPropagation();
        // Back to it as it was opened: with its history, and its own way back.
        zoomCard(prev, undefined, { history: true, back: trail.slice(0, -1) });
      }}
    >
      <span className="zoom-back-arrow" aria-hidden="true">‹</span>
      <Art card={prev} crop={crop} className="zoom-back-art" />
      <span>
        <span className="zoom-back-label">Back to</span> {prev.name}
      </span>
    </button>
  );
}
