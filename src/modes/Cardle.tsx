import { useMemo, useState } from 'react';
import type { Card } from '../lib/types';
import { ATTR, ATTRS, gradeAttr, labelFor, plainText, pretty, type Attr, type AttrKey } from '../lib/attributes';
import { cardOfTheDay, randomCard, today } from '../lib/cards';
import type { Grade } from '../lib/grade';
import { load, save } from '../lib/storage';
import { GameCard } from '../components/GameCard';
import { AnswerInput } from '../components/AnswerInput';
import { TextDiff } from '../components/TextDiff';

export const MAX_GUESSES = 6;
type Guess = Record<AttrKey, string>;

interface Saved {
  key: string; // date for daily, card id for unlimited
  cardId: string;
  guesses: Guess[];
}

const DAILY_KEY = 'hsq:cardle:daily';
const UNLIMITED_KEY = 'hsq:cardle:unlimited';
const STATS_KEY = 'hsq:cardle:stats';

interface Stats {
  played: number;
  won: number;
  lastDaily?: string;
}

const emptyGuess = (): Guess => Object.fromEntries(ATTRS.map((a) => [a.key, ''])) as Guess;
/** The attributes this card has (a spell has no attack, etc). */
const fieldsFor = (card: Card): Attr[] => ATTRS.filter((a) => a.applies(card));
const EMOJI = { correct: '🟩', close: '🟨', wrong: '⬛' } as const;

function gradeAll(g: Guess, card: Card): Partial<Record<AttrKey, Grade>> {
  return Object.fromEntries(fieldsFor(card).map((a) => [a.key, gradeAttr(a.key, g[a.key] ?? '', card)]));
}

export function Cardle({ cards }: { cards: Card[] }) {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const date = today();
  const [mode, setMode] = useState<'daily' | 'unlimited'>('daily');

  const initial = (m: 'daily' | 'unlimited'): Saved => {
    if (m === 'daily') {
      const s = load<Saved | null>(DAILY_KEY, null);
      const card = cardOfTheDay(cards, date);
      return s && s.key === date && s.cardId === card.id ? s : { key: date, cardId: card.id, guesses: [] };
    }
    const s = load<Saved | null>(UNLIMITED_KEY, null);
    if (s && byId.has(s.cardId)) return s;
    const card = randomCard(cards);
    return { key: card.id, cardId: card.id, guesses: [] };
  };

  const [game, setGame] = useState<Saved>(() => initial('daily'));
  const card = byId.get(game.cardId)!;
  const [draft, setDraft] = useState<Guess>(() => game.guesses.at(-1) ?? emptyGuess());
  const [copied, setCopied] = useState(false);

  const fields = useMemo(() => fieldsFor(card), [card]);
  const grades = useMemo(() => game.guesses.map((g) => gradeAll(g, card)), [game.guesses, card]);
  const locked = useMemo(() => {
    const s = new Set<AttrKey>();
    for (const g of grades) for (const a of fields) if (g[a.key]?.verdict === 'correct') s.add(a.key);
    return s;
  }, [grades, fields]);
  const won = locked.size === fields.length;
  const done = won || game.guesses.length >= MAX_GUESSES;

  const persist = (g: Saved, m = mode) => save(m === 'daily' ? DAILY_KEY : UNLIMITED_KEY, g);

  const switchMode = (m: 'daily' | 'unlimited') => {
    const g = initial(m);
    setMode(m);
    setGame(g);
    setDraft(g.guesses.at(-1) ?? emptyGuess());
    setCopied(false);
  };

  const newUnlimited = () => {
    const c = randomCard(cards);
    const g = { key: c.id, cardId: c.id, guesses: [] };
    setGame(g);
    persist(g, 'unlimited');
    setDraft(emptyGuess());
    setCopied(false);
  };

  const submit = () => {
    if (done) return;
    // Locked fields keep their correct answer.
    const guess = { ...draft };
    for (const k of locked) guess[k] = game.guesses.at(-1)![k];
    const g = { ...game, guesses: [...game.guesses, guess] };
    setGame(g);
    persist(g);
    const w = fields.every((a) => locked.has(a.key) || gradeAttr(a.key, guess[a.key], card).verdict === 'correct');
    if (w || g.guesses.length >= MAX_GUESSES) {
      const stats = load<Stats>(STATS_KEY, { played: 0, won: 0 });
      if (mode !== 'daily' || stats.lastDaily !== date) {
        save(STATS_KEY, { played: stats.played + 1, won: stats.won + (w ? 1 : 0), lastDaily: mode === 'daily' ? date : stats.lastDaily });
      }
    }
  };

  const share = async () => {
    const rows = grades.map((g) => fields.map((a) => EMOJI[g[a.key]!.verdict]).join('')).join('\n');
    const head = `HS Cardle ${mode === 'daily' ? date : '(unlimited)'} ${won ? game.guesses.length : 'X'}/${MAX_GUESSES}`;
    const text = `${head}\n${rows}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* user cancelled */
    }
  };

  const hidden = useMemo(() => new Set<AttrKey>(done ? [] : ATTRS.map((a) => a.key).filter((k) => !locked.has(k))), [done, locked]);
  const left = MAX_GUESSES - game.guesses.length;

  return (
    <div className="mode">
      <div className="tabs">
        <button className={mode === 'daily' ? 'on' : ''} onClick={() => switchMode('daily')}>
          Daily
        </button>
        <button className={mode === 'unlimited' ? 'on' : ''} onClick={() => switchMode('unlimited')}>
          Unlimited
        </button>
      </div>
      <div className="hud">
        <span>{mode === 'daily' ? date : 'Unlimited'}</span>
        <span>
          Guesses left <b>{left}</b>
        </span>
        <span className="muted">
          {locked.size}/{fields.length} 🟩
        </span>
      </div>

      <GameCard card={card} hidden={hidden} />

      {done && (
        <div className={`panel center feedback ${won ? 'ok' : 'bad'}`}>
          <h2>{won ? `Solved in ${game.guesses.length}!` : 'Out of guesses'}</h2>
          {!won && (
            <p>
              It was <b>{card.name}</b>.
            </p>
          )}
          <div className="row">
            <button className="btn" onClick={share}>
              {copied ? 'Copied!' : 'Share'}
            </button>
            {mode === 'unlimited' ? (
              <button className="btn primary" onClick={newUnlimited}>
                New card
              </button>
            ) : (
              <button className="btn primary" onClick={() => switchMode('unlimited')}>
                Play unlimited
              </button>
            )}
          </div>
        </div>
      )}

      <form
        className="panel fields"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!done && game.guesses.length === 0 && (
          <p className="muted small">
            Fill in the blank card. After each guess: 🟩 right (it appears on the card), 🟨 close (numbers ±1, overlapping tribe or class,
            text at least 50% right), ⬛ wrong. Leave the text blank if you think the card has none.
          </p>
        )}
        {fields.map((a) => {
          const isLocked = locked.has(a.key) || done;
          return (
            <div key={a.key} className={`field ${locked.has(a.key) ? 'locked' : ''}`}>
              <div className="field-head">
                <label>{labelFor(a, card)}</label>
                <History attr={a.key} guesses={game.guesses} grades={grades} />
              </div>
              {isLocked ? (
                <div className="locked-value">
                  {a.key === 'text' ? (
                    <TextDiff truth={plainText(card.text)} matched={done ? grades.at(-1)?.text?.truthMatched : undefined} />
                  ) : (
                    pretty(a.key, ATTR[a.key].value(card))
                  )}
                </div>
              ) : (
                <AnswerInput
                  attr={a.key}
                  value={draft[a.key]}
                  onChange={(v) => setDraft((d) => ({ ...d, [a.key]: v }))}
                  cards={cards}
                />
              )}
            </div>
          );
        })}
        {!done && (
          <button className="btn primary sticky" type="submit">
            Submit guess ({game.guesses.length + 1}/{MAX_GUESSES})
          </button>
        )}
      </form>
    </div>
  );
}

function History({ attr, guesses, grades }: { attr: AttrKey; guesses: Guess[]; grades: Partial<Record<AttrKey, Grade>>[] }) {
  if (!guesses.length) return null;
  return (
    <div className="history">
      {guesses.map((g, i) => {
        const gr = grades[i][attr];
        if (!gr) return null;
        const kind = ATTR[attr].kind;
        let label: string;
        if (kind === 'text') label = `${Math.round((gr.score ?? 0) * 100)}%`;
        else if (kind === 'number') label = g[attr] === '' ? '—' : g[attr];
        else if (kind === 'name') label = g[attr] || '—';
        else label = g[attr] ? pretty(attr, g[attr]) : '—';
        const arrow = gr.verdict !== 'correct' && gr.arrow ? (gr.arrow === 'up' ? '↑' : '↓') : '';
        return (
          <span key={i} className={`pill v-${gr.verdict}`} title={kind === 'text' ? g[attr] : undefined}>
            {label}
            {arrow}
          </span>
        );
      })}
    </div>
  );
}
