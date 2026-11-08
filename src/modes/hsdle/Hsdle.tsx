import { useMemo, useState } from 'react';
import type { Card } from '../../lib/types';
import { cardOfTheDay, randomCard, today } from '../../lib/cards';
import { load, save } from '../../lib/storage';
import { GameCard } from '../../card/GameCard';
import { CLUES, COLUMNS, EMOJI, compare } from './compare';
import { Search } from './Search';
import { Clue, GiveUp } from './Clues';
import { Board } from './Board';

/** HSdle: guess the mystery minion; each guess shows how its stats compare. */

interface Saved {
  key: string; // date (daily) or 'unlimited'
  answerId: string;
  guesses: string[]; // card ids, oldest first
  gaveUp?: boolean;
}

const KEY = { daily: 'hsq:cardle2:daily', unlimited: 'hsq:cardle2:unlimited' } as const;
type Mode = keyof typeof KEY;

export function Hsdle({ cards }: { cards: Card[] }) {
  const minions = useMemo(() => cards.filter((c) => c.type === 'MINION'), [cards]);
  const byId = useMemo(() => new Map(minions.map((c) => [c.id, c])), [minions]);
  const date = today();
  const [mode, setMode] = useState<Mode>('daily');

  const fresh = (m: Mode): Saved => {
    const answer = m === 'daily' ? cardOfTheDay(minions, date) : randomCard(minions);
    return { key: m === 'daily' ? date : 'unlimited', answerId: answer.id, guesses: [] };
  };
  const restore = (m: Mode): Saved => {
    const s = load<Saved | null>(KEY[m], null);
    const ok = s && byId.has(s.answerId) && s.guesses.every((g) => byId.has(g));
    if (m === 'daily') {
      const answer = cardOfTheDay(minions, date);
      return ok && s.key === date && s.answerId === answer.id ? s : fresh(m);
    }
    return ok ? s : fresh(m);
  };

  const [game, setGame] = useState<Saved>(() => restore('daily'));
  const update = (g: Saved, m = mode) => {
    setGame(g);
    save(KEY[m], g);
  };
  const switchMode = (m: Mode) => {
    setMode(m);
    setGame(restore(m));
  };

  const answer = byId.get(game.answerId)!;
  const guesses = game.guesses.map((id) => byId.get(id)!);
  const won = game.guesses.includes(answer.id);
  const done = won || !!game.gaveUp;
  const wrong = guesses.filter((g) => g.id !== answer.id).length;

  const guess = (c: Card) => {
    if (done || game.guesses.includes(c.id)) return;
    update({ ...game, guesses: [...game.guesses, c.id] });
  };

  const [shared, setShared] = useState(false);
  const share = async () => {
    const rows = guesses.map((g) => {
      const t = compare(g, answer);
      return COLUMNS.map((col) => EMOJI[t[col.key].verdict]).join('');
    });
    const text = `HSdle ${mode === 'daily' ? date : '(unlimited)'}: ${won ? `${guesses.length} guess${guesses.length === 1 ? '' : 'es'}` : 'gave up'}\n${rows.join('\n')}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setShared(true);
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="mode hsdle">
      <div className="tabs">
        <button className={mode === 'daily' ? 'on' : ''} onClick={() => switchMode('daily')}>
          Daily
        </button>
        <button className={mode === 'unlimited' ? 'on' : ''} onClick={() => switchMode('unlimited')}>
          Unlimited
        </button>
      </div>

      {!done && (
        <p className="ask">
          {mode === 'daily' ? "Guess today's Hearthstone minion." : 'Guess the mystery minion.'} Type any minion's name to start.
        </p>
      )}

      {!done && <Search minions={minions} exclude={game.guesses} onPick={guess} />}

      {!done && (
        <div className="clues">
          {CLUES.map((clue) => (
            <Clue key={clue.key} label={clue.label} left={clue.after - wrong} answer={answer} kind={clue.key} />
          ))}
        </div>
      )}

      {!done && guesses.length > 0 && <GiveUp key={game.answerId} onGiveUp={() => update({ ...game, gaveUp: true })} />}

      {done && (
        <div className="hsdle-result">
          <div className={`feedback ${won ? 'ok' : 'bad'}`}>
            <div className="feedback-head">{won ? 'You got it!' : 'You gave up. The answer was'}</div>
            <div>
              <b>{answer.name}</b>
              {won && (
                <>
                  {' '}
                  in {guesses.length} guess{guesses.length === 1 ? '' : 'es'}
                </>
              )}
            </div>
          </div>
          <GameCard card={answer} hidden={new Set()} pool={cards} />
          <div className="row">
            <button className="btn" onClick={share}>
              {shared ? 'Copied!' : 'Share'}
            </button>
            {mode === 'unlimited' ? (
              <button className="btn primary" onClick={() => update(fresh('unlimited'))}>
                New minion
              </button>
            ) : (
              <button className="btn primary" onClick={() => switchMode('unlimited')}>
                Play unlimited
              </button>
            )}
          </div>
        </div>
      )}

      {guesses.length > 0 && <Board guesses={guesses} answer={answer} />}


      {guesses.length === 0 && !done && (
        <p className="muted small center">
          Each guess shows how close it is: 🟩 same, 🟨 partly the same (shares a keyword, tribe or class; set from the same year),
          🟥 different. Arrows point toward the answer: higher stats, a newer set, a rarer card.
        </p>
      )}
    </div>
  );
}
