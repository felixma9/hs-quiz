import { useMemo, useState } from 'react';
import type { Card } from '../../lib/types';
import { randomCard, today } from '../../lib/cards';
import { load, save } from '../../lib/storage';
import { GameCard } from '../../card/GameCard';
import { CLUES, EMOJI, columnsFor, compare } from './compare';
import { Search } from './Search';
import { Clue, GiveUp } from './Clues';
import { Board } from './Board';
import { RevealCard } from './RevealCard';
import { CLASSIC_AGE, dailyCard, dailyPool, playable, type Daily } from './pools';

/**
 * HSdle: guess the mystery card from how close each guess is. The dailies
 * (Standard, and Classic for sets 10+ years old) are the same card for
 * everyone; Unlimited picks at random from the menu's card pool. The card's
 * type is given, and guesses are cards of that type.
 */

interface Saved {
  key: string; // date (dailies) or 'unlimited'
  answerId: string;
  guesses: string[]; // card ids, oldest first
  gaveUp?: boolean;
}

type Mode = Daily | 'unlimited';
const KEY: Record<Mode, string> = { standard: 'hsq:hsdle3:daily', classic: 'hsq:hsdle3:classic', unlimited: 'hsq:hsdle3:unlimited' };
const TYPE_WORD: Record<string, string> = { MINION: 'minion', SPELL: 'spell', WEAPON: 'weapon', LOCATION: 'location' };

/** `all`: every card (the dailies' pools come from these). `pool`: the menu's card pool, for Unlimited. */
export function Hsdle({ all, pool }: { all: Card[]; pool: Card[] }) {
  const date = today();
  const unlimitedPool = useMemo(() => playable(pool), [pool]);
  const pools = useMemo(
    () => ({ standard: dailyPool(all, 'standard', date), classic: dailyPool(all, 'classic', date), unlimited: unlimitedPool }),
    [all, unlimitedPool, date],
  );
  const byId = useMemo(() => new Map(playable(all).map((c) => [c.id, c])), [all]);
  const [mode, setMode] = useState<Mode>('standard');

  const fresh = (m: Mode): Saved | null => {
    const answer = m === 'unlimited' ? (pools.unlimited.length ? randomCard(pools.unlimited) : undefined) : dailyCard(all, m, date);
    return answer ? { key: m === 'unlimited' ? 'unlimited' : date, answerId: answer.id, guesses: [] } : null;
  };
  const restore = (m: Mode): Saved | null => {
    const s = load<Saved | null>(KEY[m], null);
    const ok = s && byId.has(s.answerId) && s.guesses.every((g) => byId.has(g));
    if (m !== 'unlimited') {
      // A daily save only counts for today's card.
      const answer = dailyCard(all, m, date);
      return ok && s.key === date && s.answerId === answer?.id ? s : fresh(m);
    }
    return ok && pools.unlimited.some((c) => c.id === s.answerId) ? s : fresh(m);
  };

  const [game, setGame] = useState<Saved | null>(() => restore('standard'));
  const update = (g: Saved | null, m = mode) => {
    setGame(g);
    if (g) save(KEY[m], g);
  };
  const switchMode = (m: Mode) => {
    setMode(m);
    setGame(restore(m));
  };
  const daily = mode !== 'unlimited';

  return (
    <div className={`mode hsdle ${game && game.guesses.includes(game.answerId) ? 'won' : ''}`}>
      <div className="tabs">
        <button className={daily ? 'on' : ''} onClick={() => !daily && switchMode('standard')}>
          Daily
        </button>
        <button className={mode === 'unlimited' ? 'on' : ''} onClick={() => switchMode('unlimited')}>
          Unlimited
        </button>
      </div>
      {daily && (
        <div className="daily-kind" role="radiogroup" aria-label="Which daily">
          <button type="button" role="radio" aria-checked={mode === 'standard'} className={mode === 'standard' ? 'on' : ''} onClick={() => switchMode('standard')}>
            Standard
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'classic'}
            className={mode === 'classic' ? 'on' : ''}
            onClick={() => switchMode('classic')}
            title={`Cards from sets ${CLASSIC_AGE}+ years old`}
          >
            Classic
          </button>
        </div>
      )}
      {game ? (
        <HsdleGame
          key={`${mode}:${game.answerId}`}
          mode={mode}
          date={date}
          game={game}
          answer={byId.get(game.answerId)!}
          // Guesses are cards of the answer's type, from the same pool.
          candidates={pools[mode]}
          byId={byId}
          drawable={all}
          onUpdate={(g) => update(g)}
          onNew={() => update(fresh('unlimited'))}
          onUnlimited={() => switchMode('unlimited')}
        />
      ) : (
        <div className="panel center">
          {mode === 'unlimited' ? (
            <>
              Your card pool has no cards HSdle can use. <a href="#/">Change it.</a>
            </>
          ) : (
            'No cards for this daily.'
          )}
        </div>
      )}
    </div>
  );
}

function HsdleGame({
  mode,
  date,
  game,
  answer,
  candidates,
  byId,
  drawable,
  onUpdate,
  onNew,
  onUnlimited,
}: {
  mode: Mode;
  date: string;
  game: Saved;
  answer: Card;
  candidates: Card[];
  byId: Map<string, Card>;
  drawable: Card[];
  onUpdate(g: Saved): void;
  onNew(): void;
  onUnlimited(): void;
}) {
  const sameType = useMemo(() => candidates.filter((c) => c.type === answer.type), [candidates, answer.type]);
  const guesses = game.guesses.map((id) => byId.get(id)!);
  const won = game.guesses.includes(answer.id);
  const done = won || !!game.gaveUp;
  const wrong = guesses.filter((g) => g.id !== answer.id).length;
  const what = TYPE_WORD[answer.type] ?? 'card';

  const guess = (c: Card) => {
    if (done || game.guesses.includes(c.id)) return;
    onUpdate({ ...game, guesses: [...game.guesses, c.id] });
  };

  // Clues the player has opened (a new card starts with them closed: this component is keyed by it).
  const [openClues, setOpenClues] = useState<string[]>([]);
  const toggleClue = (k: string) => setOpenClues((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  // Once the mystery art is on the card, suggestions show names only.
  const artOnCard = openClues.includes('art') && wrong >= CLUES.find((c) => c.key === 'art')!.after;

  const [shared, setShared] = useState(false);
  const share = async () => {
    const columns = columnsFor(answer.type);
    const rows = guesses.map((g) => {
      const t = compare(g, answer);
      return columns.map((col) => EMOJI[t[col.key].verdict]).join('');
    });
    const title = mode === 'unlimited' ? 'HSdle (unlimited)' : `HSdle${mode === 'classic' ? ' Classic' : ''} ${date}`;
    const text = `${title}: ${won ? `${guesses.length} guess${guesses.length === 1 ? '' : 'es'}` : 'gave up'}\n${rows.join('\n')}`;
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

  const article = /^[aeiou]/.test(what) ? 'an' : 'a';
  return (
    <>
      {!done && (
        <p className="ask">
          {mode === 'unlimited' ? (
            'Guess the card.'
          ) : mode === 'classic' ? (
            <>
              Guess today's <b>Classic</b> card (from sets {CLASSIC_AGE}+ years old).
            </>
          ) : (
            <>
              Guess today's <b>Standard</b> card.
            </>
          )}{' '}
          It's {article} <b>{what}</b>.
        </p>
      )}

      {!done && <Search cards={sameType} what={what} exclude={game.guesses} art={!artOnCard} onPick={guess} />}

      {!done && (
        <RevealCard
          answer={answer}
          guesses={guesses}
          wrong={wrong}
          artShown={openClues.includes('art')}
          textShown={openClues.includes('text')}
          pool={drawable}
        />
      )}

      {!done && (
        <div className="clues">
          {CLUES.map((clue) => (
            <Clue
              key={clue.key}
              label={clue.label}
              left={clue.after - wrong}
              answer={answer}
              kind={clue.key}
              open={openClues.includes(clue.key)}
              onToggle={() => toggleClue(clue.key)}
            />
          ))}
        </div>
      )}

      {!done && guesses.length > 0 && <GiveUp onGiveUp={() => onUpdate({ ...game, gaveUp: true })} />}

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
          <GameCard card={answer} hidden={new Set()} pool={drawable} />
          <div className="row">
            <button className="btn" onClick={share}>
              {shared ? 'Copied!' : 'Share'}
            </button>
            {mode === 'unlimited' ? (
              <button className="btn primary" onClick={onNew}>
                New card
              </button>
            ) : (
              <button className="btn primary" onClick={onUnlimited}>
                Play unlimited
              </button>
            )}
          </div>
        </div>
      )}

      {guesses.length > 0 && <Board guesses={guesses} answer={answer} />}

      {guesses.length === 0 && !done && (
        <p className="muted small center">
          🟩 same · 🟨 close (shared keyword, tribe, school or class; same-year set) · 🟥 different. Arrows point toward the answer.
        </p>
      )}
    </>
  );
}
