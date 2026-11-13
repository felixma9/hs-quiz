import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Card } from '../lib/types';
import { drawable } from '../pool/pool';
import { GameCard } from '../card/GameCard';
import { loadHistory, timeline, type HistoryFile } from '../lib/history';
import { CardTimeline } from './CardTimeline';
import { Tilt } from './Tilt';

/**
 * Tap a card's round art icon to see the whole card. Any screen calls
 * zoomCard(); the one CardZoomHost in App shows it. With `history` (CardDB),
 * tapping the card again opens every version of it on a timeline.
 */
type Zoom = { card: Card; note?: ReactNode; history?: boolean } | null;
let show: ((z: Zoom) => void) | null = null;

export function zoomCard(card: Card, note?: ReactNode, opts: { history?: boolean } = {}) {
  show?.({ card, note, history: opts.history });
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
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState<HistoryFile | null | undefined>(undefined);
  useEffect(() => {
    show = setZ;
    return () => {
      show = null;
    };
  }, []);
  // Leaving the page (Back, a link) closes the zoom rather than leaving it over the next page.
  useEffect(() => {
    const close = () => setZ(null);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);
  // A new card starts closed; the history file loads the first time a card that wants it opens.
  useEffect(() => setOpen(false), [z]);
  useEffect(() => {
    if (z?.history && hist === undefined) loadHistory().then(setHist);
  }, [z, hist]);
  useEffect(() => {
    if (!z) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZ(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [z]);
  // Our own renderer draws minions, spells, weapons and heroes; anything else uses HearthstoneJSON's render.
  const canDraw = useMemo(() => !!z && drawable([z.card]).length > 0, [z]);
  const versions = useMemo(() => (z?.history && hist !== undefined ? timeline(z.card, hist) : null), [z, hist]);
  if (!z) return null;
  const past = versions ? versions.length - 1 : 0;
  const close = () => setZ(null);

  const hint = !z.history
    ? 'Tap anywhere to close'
    : versions === null
      ? 'Loading history…'
      : past
        ? `Tap the card for its history (${past} change${past === 1 ? '' : 's'}) · tap outside to close`
        : hist === null
          ? "Couldn't load this card's history · tap outside to close"
          : 'Tap the card for its release and set · tap outside to close';
  // CardDB: the card opens into its timeline in place, over the page.
  if (z.history)
    return (
      <div
        className={`zoom zoom-history ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={open ? `${z.card.name}: every version` : z.card.name}
        onClick={close}
      >
        {/* Taps on the cards, rail and details stay there; anywhere else (or Escape) closes. */}
        <CardTimeline card={z.card} versions={versions} open={open && !!versions} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} hint={hint} />
      </div>
    );
  return (
    <div className="zoom" role="dialog" aria-modal="true" aria-label={z.card.name} onClick={close}>
      {/* Tap anywhere (the card too) or press Escape to close: no close button. */}
      <figure className="zoom-card">
        <Tilt>
          {canDraw ? (
            <GameCard card={z.card} hidden={NONE} pool={[]} />
          ) : (
            <img className="zoom-render" src={renderUrl(z.card)} alt={z.card.name} />
          )}
        </Tilt>
        {z.note && <figcaption className="zoom-note">{z.note}</figcaption>}
        <span className="zoom-hint">{hint}</span>
      </figure>
    </div>
  );
}
