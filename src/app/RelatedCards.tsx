import { useEffect, useState } from 'react';
import type { Card } from '../lib/types';
import { isCollectible, relatedCards } from '../lib/cards';
import { Art, useArtCrop } from '../modes/hsdle/Art';
import { zoomCard } from './CardZoom';

/**
 * The cards the game shows with this one (a token it summons, a quest's reward, a hero's power),
 * as art icons under the zoomed card. Tapping one opens it in its place: a collectible card with
 * its history, a token on its own.
 */
export function RelatedCards({ card }: { card: Card }) {
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
                zoomCard(r, isCollectible(r) ? undefined : `Related to ${card.name}`, isCollectible(r) ? { history: true, from } : {});
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
