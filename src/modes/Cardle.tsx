import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../lib/types';
import { cardOfTheDay, randomCard, today } from '../lib/cards';
import { CLUES, COLUMNS, EMOJI, compare, type Tile } from '../lib/cardle';
import { normalizeName } from '../lib/fuzzy';
import { plainText } from '../lib/attributes';
import { load, save } from '../lib/storage';
import { GameCard } from '../components/GameCard';

/** Guess the mystery minion, Loldle-style: each guess shows how its stats compare. */

interface Saved {
  key: string; // date (daily) or 'unlimited'
  answerId: string;
  guesses: string[]; // card ids, oldest first
  gaveUp?: boolean;
}

const KEY = { daily: 'hsq:cardle2:daily', unlimited: 'hsq:cardle2:unlimited' } as const;
type Mode = keyof typeof KEY;

/** Stat columns are drawn on the same gem icons the cards use. */
const GEM: Partial<Record<string, string>> = {
  cost: 'cost-mana',
  attack: 'attack-minion',
  health: 'health',
};
const gemUrl = (key: string) => `${import.meta.env.BASE_URL}sunwell/${GEM[key]}.webp`;

const thumb = (c: Card) => `https://art.hearthstonejson.com/v1/256x/${c.id}.jpg`;

export function Cardle({ cards }: { cards: Card[] }) {
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
    const text = `HS Cardle ${mode === 'daily' ? date : '(unlimited)'}: ${won ? `${guesses.length} guess${guesses.length === 1 ? '' : 'es'}` : 'gave up'}\n${rows.join('\n')}`;
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
    <div className="mode cardle">
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

      {done && (
        <div className="cardle-result">
          <div className={`feedback ${won ? 'ok' : 'bad'}`}>
            <div className="feedback-head">{won ? 'You got it!' : 'The answer was'}</div>
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

      {!done && mode === 'unlimited' && guesses.length >= 3 && (
        <button className="link give-up" onClick={() => update({ ...game, gaveUp: true })}>
          Give up and show the answer
        </button>
      )}

      {guesses.length === 0 && !done && (
        <p className="muted small center">
          Each guess shows how close it is: 🟩 same, 🟨 partly the same (shares a keyword, tribe or class; set from the same year),
          🟥 different. Arrows point toward the answer: higher stats, a newer set, a rarer card.
        </p>
      )}
    </div>
  );
}

function Search({ minions, exclude, onPick }: { minions: Card[]; exclude: string[]; onPick(c: Card): void }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const n = normalizeName(q);
    if (!n) return [];
    const ex = new Set(exclude);
    const pool = minions.filter((c) => !ex.has(c.id));
    const starts = pool.filter((c) => normalizeName(c.name).startsWith(n));
    const inside = pool.filter((c) => !normalizeName(c.name).startsWith(n) && normalizeName(c.name).includes(n));
    return [...starts, ...inside].slice(0, 8);
  }, [q, minions, exclude]);
  useEffect(() => setHi(0), [q]);

  const pick = (c: Card) => {
    onPick(c);
    setQ('');
    input.current?.focus();
  };

  return (
    <div className="search">
      <input
        ref={input}
        className="in"
        placeholder="Type a minion name…"
        value={q}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && matches[hi]) {
            e.preventDefault();
            pick(matches[hi]);
          }
        }}
      />
      {matches.length > 0 && (
        <ul className="search-list">
          {matches.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={i === hi ? 'hi' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(c)}
              >
                <img src={thumb(c)} alt="" loading="lazy" />
                <span>{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Clue({ label, left, answer, kind }: { label: string; left: number; answer: Card; kind: 'art' | 'text' }) {
  const [open, setOpen] = useState(false);
  const unlocked = left <= 0;
  useEffect(() => setOpen(false), [answer.id]);
  return (
    <div className="clue">
      <button className={`clue-btn ${unlocked ? 'unlocked' : ''} ${open ? 'on' : ''}`} disabled={!unlocked} onClick={() => setOpen((o) => !o)}>
        {label}
        <span className="small">{unlocked ? (open ? 'Hide' : 'Show') : `in ${left} ${left === 1 ? 'try' : 'tries'}`}</span>
      </button>
      {open && unlocked && (
        <div className="clue-body">
          {kind === 'art' ? (
            <img className="clue-art" src={thumb(answer)} alt="The mystery minion's art" />
          ) : (
            <p>{answer.text ? plainText(answer.text).split(answer.name).join('???') : 'This minion has no card text.'}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Board({ guesses, answer }: { guesses: Card[]; answer: Card }) {
  // Newest guess first, like the original game.
  const rows = [...guesses].reverse();
  return (
    <div className="board-wrap">
      <div className="board" role="table">
        <div className="board-row board-head" role="row">
          <div className="board-cell name-cell" role="columnheader">
            Minion
          </div>
          {COLUMNS.map((c) => (
            <div key={c.key} className="board-cell" role="columnheader">
              {GEM[c.key] && <img className="head-gem" src={gemUrl(c.key)} alt="" />}
              {c.label}
            </div>
          ))}
        </div>
        {rows.map((g, r) => {
          const t = compare(g, answer);
          return (
            <div key={g.id} className={`board-row ${r === 0 ? 'newest' : ''}`} role="row">
              <div className="board-cell name-cell" role="cell" title={g.name}>
                <img src={thumb(g)} alt="" />
                <span>{g.name}</span>
              </div>
              {COLUMNS.map((c, i) => (
                <TileCell key={c.key} col={c.key} tile={t[c.key]} delay={r === 0 ? i * 120 : 0} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TileCell({ col, tile, delay }: { col: string; tile: Tile; delay: number }) {
  const arrowLabel = tile.arrow === 'up' ? 'higher' : 'lower';
  if (GEM[col]) {
    return (
      <div className={`board-cell tile stat-tile t-${tile.verdict}`} style={{ animationDelay: `${delay}ms` }} role="cell">
        <span className={`stat-gem gem-${col}`}>
          <img src={gemUrl(col)} alt="" />
          <span className="stat-num">{tile.label}</span>
        </span>
        {tile.arrow && (
          <span className="arrow-badge" aria-label={arrowLabel}>
            {tile.arrow === 'up' ? '▲' : '▼'}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={`board-cell tile t-${tile.verdict}`} style={{ animationDelay: `${delay}ms` }} role="cell">
      {tile.arrow && <span className={`tile-arrow ${tile.arrow}`} aria-label={arrowLabel} />}
      <span className="tile-label">{tile.label}</span>
    </div>
  );
}
