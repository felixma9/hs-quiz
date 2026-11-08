import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../lib/types';
import { cardOfTheDay, randomCard, today } from '../lib/cards';
import { CLUES, COLUMNS, EMOJI, compare, type Tile } from '../lib/hsdle';
import { normalizeName } from '../lib/fuzzy';
import { plainText } from '../lib/attributes';
import { load, save } from '../lib/storage';
import { GameCard } from '../components/GameCard';

/** HSdle: guess the mystery minion; each guess shows how its stats compare. */

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

/**
 * Per-card art crop (fraction cut from each side), measured by
 * scripts/measure-art.py: some art is padded with light bars.
 */
let artCrop: Promise<Record<string, number>> | null = null;
function useArtCrop() {
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
function Art({ card, crop, alt = '', className = '' }: { card: Card; crop: Record<string, number>; alt?: string; className?: string }) {
  const cut = Math.min(crop[card.id] ?? 0, 0.3);
  const scale = cut ? 1.04 / (1 - 2 * cut) : 1.08;
  return (
    <span className={`art-crop ${className}`}>
      <img src={thumb(card)} alt={alt} loading="lazy" style={{ transform: `scale(${scale.toFixed(3)})` }} />
    </span>
  );
}

const RARITY_COLOR: Record<string, string> = { Free: '#b5b5b5', Common: '#f2f2f2', Rare: '#3a7cf0', Epic: '#a640d8', Legendary: '#f29f1c' };
const RARITY_SHORT: Record<string, string> = { Free: 'Free', Common: 'Com.', Rare: 'Rare', Epic: 'Epic', Legendary: 'Leg.' };

const thumb = (c: Card) => `https://art.hearthstonejson.com/v1/256x/${c.id}.jpg`;

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

/** Two taps to give up, so it can't happen by accident. */
function GiveUp({ onGiveUp }: { onGiveUp(): void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={`give-up ${armed ? 'armed' : ''}`} onClick={() => (armed ? onGiveUp() : setArmed(true))}>
      {armed ? 'Tap again to give up and see the answer' : 'Give up'}
    </button>
  );
}

function Search({ minions, exclude, onPick }: { minions: Card[]; exclude: string[]; onPick(c: Card): void }) {
  const crop = useArtCrop();
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
                <Art card={c} crop={crop} className="thumb" />
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
  const crop = useArtCrop();
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
            <Art card={answer} crop={crop} className="clue-art" alt="The mystery minion's art" />
          ) : (
            <p>{answer.text ? plainText(answer.text).split(answer.name).join('???') : 'This minion has no card text.'}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Board({ guesses, answer }: { guesses: Card[]; answer: Card }) {
  const crop = useArtCrop();
  // Newest guess first, like the original game.
  const rows = [...guesses].reverse();
  // Tapping a tile shows its full value (tiles are small on phones).
  const [detail, setDetail] = useState<{ id: string; col: string } | null>(null);
  const detailCard = detail && guesses.find((g) => g.id === detail.id);
  const detailText = (() => {
    if (!detail || !detailCard) return null;
    if (detail.col === 'name') return detailCard.name;
    const col = COLUMNS.find((c) => c.key === detail.col)!;
    return `${detailCard.name} · ${col.label}: ${compare(detailCard, answer)[col.key].label}`;
  })();
  const tap = (id: string, col: string) => setDetail((d) => (d && d.id === id && d.col === col ? null : { id, col }));

  return (
    <div className="board-wrap">
      <div className="board" role="table">
        <div className="board-row board-head" role="row">
          <div className="board-cell name-cell" role="columnheader">
            <span className="head-label">Minion</span>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.key} className={`board-cell ${GEM[c.key] ? 'gem-head' : ''}`} role="columnheader" title={c.label}>
              {GEM[c.key] && <img className="head-gem" src={gemUrl(c.key)} alt={c.label} />}
              <span className="head-label">{c.label}</span>
            </div>
          ))}
        </div>
        {rows.map((g, r) => {
          const t = compare(g, answer);
          const on = (col: string) => detail?.id === g.id && detail.col === col;
          return (
            <div key={g.id} className={`board-row ${r === 0 ? 'newest' : ''}`} role="row">
              <button type="button" className={`board-cell name-cell ${on('name') ? 'selected' : ''}`} role="cell" title={g.name} onClick={() => tap(g.id, 'name')}>
                <Art card={g} crop={crop} className="thumb" />
                <span className="name-text">{g.name}</span>
              </button>
              {COLUMNS.map((c, i) => (
                <TileCell
                  key={c.key}
                  col={c.key}
                  tile={t[c.key]}
                  delay={r === 0 ? i * 120 : 0}
                  selected={on(c.key)}
                  onTap={() => tap(g.id, c.key)}
                />
              ))}
            </div>
          );
        })}
      </div>
      {detailText && <div className="board-detail">{detailText}</div>}
    </div>
  );
}

function TileCell({ col, tile, delay, selected, onTap }: { col: string; tile: Tile; delay: number; selected: boolean; onTap(): void }) {
  const arrowLabel = tile.arrow === 'up' ? 'higher' : 'lower';
  if (GEM[col]) {
    return (
      <div className={`board-cell tile stat-tile t-${tile.verdict} ${selected ? 'selected' : ''}`} style={{ animationDelay: `${delay}ms` }} role="cell" onClick={onTap}>
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
    <div className={`board-cell tile t-${tile.verdict} ${selected ? 'selected' : ''}`} style={{ animationDelay: `${delay}ms` }} role="cell" onClick={onTap}>
      {tile.arrow && <span className={`tile-arrow ${tile.arrow}`} aria-label={arrowLabel} />}
      {col === 'rarity' ? (
        <span className="tile-label rarity-label">
          <span className="rarity-gem" style={{ background: RARITY_COLOR[tile.label] ?? '#999' }} />
          <span className="full">{tile.label}</span>
          <span className="short">{RARITY_SHORT[tile.label] ?? tile.label}</span>
        </span>
      ) : (
        <span className="tile-label">{tile.label}</span>
      )}
    </div>
  );
}
