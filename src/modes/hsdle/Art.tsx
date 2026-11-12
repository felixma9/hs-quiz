import type React from 'react';
import { useEffect, useState } from 'react';
import type { Card } from '../../lib/types';
import { zoomProps } from '../../app/CardZoom';


/**
 * Per-card art crop (fraction cut from each side), measured by
 * scripts/measure-art.py: some art is padded with light bars.
 */
let artCrop: Promise<Record<string, number>> | null = null;
export function useArtCrop() {
  const [crop, setCrop] = useState<Record<string, number>>({});
  useEffect(() => {
    artCrop ??= fetch(`${import.meta.env.BASE_URL}art-crop.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    let live = true;
    artCrop.then((c) => live && setCrop(c));
    return () => {
      live = false;
    };
  }, []);
  return crop;
}

/** The zoom that hides a card's padding, plus a little margin. */
export function Art({
  card,
  crop,
  alt = '',
  className = '',
  zoom = false,
}: {
  card: Card;
  crop: Record<string, number>;
  alt?: string;
  className?: string;
  /** Tap to see the whole card. Only where the card isn't a secret. */
  zoom?: boolean;
}) {
  const cut = Math.min(crop[card.id] ?? 0, 0.3);
  const scale = cut ? 1.04 / (1 - 2 * cut) : 1.08;
  return (
    <span className={`art-crop ${className} ${zoom ? 'zoomable' : ''}`} {...(zoom ? zoomProps(card) : {})}>
      {/* The zoom is a variable, so hover effects can scale on top of it (see desktop.css). */}
      <img src={thumb(card)} alt={alt} loading="lazy" style={{ '--crop': scale.toFixed(3) } as React.CSSProperties} />
    </span>
  );
}

const thumb = (c: Card) => `https://art.hearthstonejson.com/v1/256x/${c.id}.jpg`;
