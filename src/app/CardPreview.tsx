import type { Card } from '../lib/types';
import { GameCard } from '../card/GameCard';

/** #/card/<id>: one card, fully revealed. Handy for checking how a card draws. */
export function CardPreview({ cards }: { cards: Card[] }) {
  const id = decodeURIComponent(location.hash.replace(/^#\/?card\//, ''));
  const card = cards.find((c) => c.id === id);
  if (!card) return <div className="panel center muted">No card with id {id}.</div>;
  return <GameCard card={card} hidden={new Set()} pool={cards} />;
}
