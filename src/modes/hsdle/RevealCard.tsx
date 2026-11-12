import { useMemo } from 'react';
import type { Card } from '../../lib/types';
import type { AttrKey } from '../../lib/attributes';
import type { Verdict } from '../../lib/grade';
import { GameCard } from '../../card/GameCard';
import { CLUES, compare, type ColumnKey } from './compare';
import { setName } from '../../data/sets';

/** Board columns that are a part of the card. Keywords go in the text box (see below). */
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

/** What these guesses have found out: columns they got right, and the answer's keywords any of them shares. */
function known(guesses: Card[], answer: Card) {
  const cols = new Set<ColumnKey>();
  const keywords = new Set<string>();
  for (const g of guesses) {
    const t = compare(g, answer);
    for (const k of Object.keys(t) as ColumnKey[]) if (t[k].verdict === 'correct') cols.add(k);
    for (const k of g.keywords ?? []) if (answer.keywords?.includes(k)) keywords.add(k);
  }
  return { cols, keywords };
}

/**
 * The mystery minion as a card that starts blank. Every column a guess gets
 * right fills in its part (mana, attack, health, rarity, tribe, class, set
 * icon), and every keyword a guess shares with it is written in the text box.
 * The art and the text go on only when the player opens their clues. Parts
 * that just filled in are outlined green until the next guess.
 */
export function RevealCard({
  answer,
  guesses,
  wrong,
  artShown,
  textShown,
  pool,
}: {
  answer: Card;
  guesses: Card[];
  wrong: number;
  /** The player opened the Art clue. */
  artShown: boolean;
  /** The player opened the Card text clue. */
  textShown: boolean;
  pool: Card[];
}) {
  const now = useMemo(() => known(guesses, answer), [guesses, answer]);
  const before = useMemo(() => known(guesses.slice(0, -1), answer), [guesses, answer]);

  const hidden = new Set<AttrKey>(['name', 'text']);
  const fresh: Partial<Record<AttrKey, Verdict>> = {};
  for (const [col, part] of Object.entries(PART) as [ColumnKey, AttrKey][]) {
    if (!now.cols.has(col)) hidden.add(part);
    else if (!before.cols.has(col)) fresh[part] = 'correct';
  }

  const art = artShown && wrong >= ART_AFTER;
  const showText = textShown && wrong >= TEXT_AFTER;
  // Text is drawn as a "guess": the real text with the minion's own name blanked out (as in
  // the text clue), or until then the keywords found so far, in the card's order, in bold.
  const found = (answer.keywords ?? []).filter((k) => now.keywords.has(k));
  const text = showText
    ? (answer.text ?? '').split(answer.name).join('???')
    : found.map((k) => `<b>${k}</b>`).join(', ');
  if (!showText && found.length > before.keywords.size) fresh.text = 'correct';
  // The set icon is a faint watermark in the text box, so outline the box when it appears.
  // Basic (LEGACY) cards have no icon, in the game or here.
  const setKnown = now.cols.has('set');
  const setNew = setKnown && !before.cols.has('set');
  if (setNew && answer.set !== 'LEGACY') fresh.text = 'correct';

  const parts = [
    ...Object.keys(PART).map((k) => now.cols.has(k as ColumnKey)),
    now.cols.has('set'),
    now.cols.has('keywords'),
    art,
    showText,
  ];
  const filled = parts.filter(Boolean).length;

  return (
    <section className="reveal-card" aria-label="The mystery minion so far">
      <GameCard card={answer} hidden={hidden} draft={text ? { text } : {}} verdicts={fresh} pool={pool} extras={{ art, set: setKnown }} />
      {/* Named here too: the icon is faint, and Basic cards have none. */}
      <div className="card-chips">
        <span className={`chip ${setNew ? 'v-correct' : ''}`}>Set: {setKnown ? setName(answer.set) : '?'}</span>
      </div>
      <p className="muted small center reveal-caption">
        {filled === 0 ? 'The card fills in as you get things right.' : `${filled} of ${parts.length} parts filled in.`}
        {wrong < ART_AFTER
          ? ` Art after ${ART_AFTER} misses, text after ${TEXT_AFTER}.`
          : wrong < TEXT_AFTER
            ? `${art ? '' : ' Tap Art below to put it on the card.'} Text after ${TEXT_AFTER} misses.`
            : !art && !showText
              ? ' Tap Art or Card text below to put them on the card.'
              : !art
                ? ' Tap Art below to put it on the card.'
                : !showText
                  ? ' Tap Card text below to put it on the card.'
                  : ''}
      </p>
    </section>
  );
}
