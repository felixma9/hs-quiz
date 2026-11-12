import { useMemo } from 'react';
import type { Card } from '../../lib/types';
import type { AttrKey } from '../../lib/attributes';
import type { Verdict } from '../../lib/grade';
import { GameCard } from '../../card/GameCard';
import { CLUES, compare, type ColumnKey } from './compare';

/** Board columns that are a part of the card. Keywords have no spot of their own (they're in the text). */
const PART: Partial<Record<ColumnKey, AttrKey>> = {
  cost: 'cost',
  attack: 'attack',
  health: 'health',
  rarity: 'rarity',
  tribe: 'tribe',
  class: 'class',
};

const ART_AFTER = CLUES.find((c) => c.key === 'art')!.after;
const TEXT_AFTER = CLUES.find((c) => c.key === 'text')!.after;

/** Columns any of these guesses got right. */
function known(guesses: Card[], answer: Card): Set<ColumnKey> {
  const got = new Set<ColumnKey>();
  for (const g of guesses) {
    const t = compare(g, answer);
    for (const k of Object.keys(t) as ColumnKey[]) if (t[k].verdict === 'correct') got.add(k);
  }
  return got;
}

/**
 * The mystery minion as a card that starts blank. Every column a guess gets
 * right fills in its part (mana, attack, health, rarity, tribe, class, set
 * icon); the art and text come in when their clues unlock. Parts that just
 * filled in are outlined green until the next guess.
 */
export function RevealCard({ answer, guesses, wrong, pool }: { answer: Card; guesses: Card[]; wrong: number; pool: Card[] }) {
  const got = useMemo(() => known(guesses, answer), [guesses, answer]);
  const before = useMemo(() => known(guesses.slice(0, -1), answer), [guesses, answer]);

  const hidden = new Set<AttrKey>(['name', 'text']);
  const fresh: Partial<Record<AttrKey, Verdict>> = {};
  for (const [col, part] of Object.entries(PART) as [ColumnKey, AttrKey][]) {
    if (!got.has(col)) hidden.add(part);
    else if (!before.has(col)) fresh[part] = 'correct';
  }

  const art = wrong >= ART_AFTER;
  const showText = wrong >= TEXT_AFTER;
  // Text is drawn as a "guess" so the minion's own name can be blanked out, as in the text clue.
  const draft = showText && answer.text ? { text: answer.text.split(answer.name).join('???') } : {};

  const filled = Object.keys(PART).filter((k) => got.has(k as ColumnKey)).length + Number(got.has('set')) + Number(art) + Number(showText);
  const total = Object.keys(PART).length + 3;

  return (
    <section className="reveal-card" aria-label="The mystery minion so far">
      <GameCard card={answer} hidden={hidden} draft={draft} verdicts={fresh} pool={pool} extras={{ art, set: got.has('set') }} />
      <p className="muted small center reveal-caption">
        {filled === 0 ? 'The card fills in as you get things right.' : `${filled} of ${total} parts filled in.`}
        {!art ? ` Art after ${ART_AFTER} misses, text after ${TEXT_AFTER}.` : !showText ? ` Text after ${TEXT_AFTER} misses.` : ''}
      </p>
    </section>
  );
}
