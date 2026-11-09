import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Card } from '../../lib/types';
import { ATTR, ATTRS, gradeAttr, labelFor, plainText, pretty, type AttrKey } from '../../lib/attributes';
import { giveaways, pickHidden, randomCard } from '../../lib/cards';
import type { Grade } from '../../lib/grade';
import { load, save } from '../../lib/storage';
import { GameCard } from '../../card/GameCard';
import { TextDiff } from './TextDiff';
import { loadSettings, saveSettings, type GauntletSettings as Settings } from './settings';

const LIVES = 3;
const BEST_KEY = 'hsq:gauntlet:best';


/** How to fill in each kind of blank on the card. */
const HOW: Record<string, string> = {
  number: 'tap the gem and type a number.',
  name: 'tap the name banner and type.',
  text: 'tap the text box and type (leave it blank if the card has none).',
  class: 'tap the card frame to cycle classes, or pick from the list.',
  rarity: 'tap the gem under the name to cycle rarities.',
  tribe: 'tap the banner at the bottom of the card to cycle, or pick from the list.',
};

interface Round {
  card: Card;
  hidden: AttrKey;
}

function newRound(pool: Card[], allowed: AttrKey[]): Round {
  const skip = giveaways(pool);
  for (let i = 0; i < 50; i++) {
    const card = randomCard(pool);
    const hidden = pickHidden(card, allowed.filter((k) => !skip.has(`${card.type}:${k}`)));
    if (hidden) return { card, hidden };
  }
  const card = randomCard(pool);
  return { card, hidden: 'name' };
}

export function Gauntlet({ cards }: { cards: Card[] }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const pool = useMemo(() => (settings.minionsOnly ? cards.filter((c) => c.type === 'MINION') : cards), [cards, settings.minionsOnly]);
  const [round, setRound] = useState<Round>(() => newRound(pool, settings.allowed));
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<Grade | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [best, setBest] = useState<number>(() => load(BEST_KEY, 0));
  const [showSettings, setShowSettings] = useState(false);

  const over = lives === 0;
  const attr = ATTR[round.hidden];

  const next = useCallback(() => {
    setRound(newRound(pool, settings.allowed));
    setAnswer('');
    setResult(null);
    setRevealed(false);
  }, [pool, settings.allowed]);

  const submit = () => {
    if (result || over) return next();
    if (attr.kind !== 'text' && !answer) return;
    const g = gradeAttr(round.hidden, answer, round.card);
    setResult(g);
    if (g.verdict === 'correct') {
      const s = score + 1;
      setScore(s);
      if (s > best) {
        setBest(s);
        save(BEST_KEY, s);
      }
    } else {
      setLives((l) => l - 1);
    }
  };

  /** Give up on this card: show the answer and lose a life. */
  const reveal = () => {
    if (result || over) return;
    setResult({ verdict: 'wrong' });
    setRevealed(true);
    setLives((l) => l - 1);
  };

  const restart = (s = settings) => {
    const p = s.minionsOnly ? cards.filter((c) => c.type === 'MINION') : cards;
    setScore(0);
    setLives(LIVES);
    setRound(newRound(p, s.allowed));
    setAnswer('');
    setResult(null);
    setRevealed(false);
  };

  const updateSettings = (s: Settings) => {
    if (!s.allowed.length) return;
    setSettings(s);
    saveSettings(s);
    restart(s);
  };

  // Once a card is answered, Enter moves on (or starts a new game after the last life).
  useEffect(() => {
    if (!result) return;
    // Ignore the Enter press that submitted the answer (it may still be bubbling).
    const shownAt = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.timeStamp <= shownAt) return;
      e.preventDefault();
      if (over) restart();
      else next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const hidden = useMemo(() => new Set<AttrKey>(result ? [] : [round.hidden]), [result, round.hidden]);
  const truth = attr.value(round.card);

  return (
    <div className="mode">
      <div className="hud">
        <span className="lives" aria-label={`${lives} lives`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <Heart key={i === lives ? `just-${lives}` : i} full={i < lives} just={i === lives} last={lives === 1} />
          ))}
        </span>
        <span className={`stat score ${score > 0 && score >= best ? 'record' : ''}`}>
          <span className="stat-label">Score</span>
          <b key={score} className="stat-value">{score}</b>
        </span>
        <span className="stat best">
          <span className="stat-label">Best</span>
          <b className="stat-value">{best}</b>
        </span>
        <button className="link" onClick={() => setShowSettings((v) => !v)}>
          ⚙
        </button>
      </div>

      {showSettings && (
        <div className="panel settings">
          <label className="check">
            <input
              type="checkbox"
              checked={settings.minionsOnly}
              onChange={(e) => updateSettings({ ...settings, minionsOnly: e.target.checked })}
            />
            Minions only
          </label>
          <div className="muted small">What can be left blank (changing restarts):</div>
          <div className="chips">
            {ATTRS.map((a) => (
              <label key={a.key} className="check">
                <input
                  type="checkbox"
                  checked={settings.allowed.includes(a.key)}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      allowed: e.target.checked ? [...settings.allowed, a.key] : settings.allowed.filter((k) => k !== a.key),
                    })
                  }
                />
                {a.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <GameCard
        card={round.card}
        hidden={hidden}
        draft={{ [round.hidden]: answer }}
        editable={result ? new Set() : new Set([round.hidden])}
        onChange={(_, v) => setAnswer(v)}
        verdicts={result ? { [round.hidden]: result.verdict } : {}}
        pool={cards}
        onEnter={submit}
      />

      {over && result ? (
        <div className="panel center">
          <Feedback result={result} attrKey={round.hidden} card={round.card} truthPretty={pretty(round.hidden, truth)} revealed={revealed} />
          <h2>Game over</h2>
          <p>
            You cleared <b>{score}</b> card{score === 1 ? '' : 's'}. Best: {best}.
          </p>
          <button className="btn primary" onClick={() => restart()}>
            Play again
          </button>
        </div>
      ) : (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {!result && (
            <div className="ask">
              Fill in the <b>{labelFor(attr, round.card).toLowerCase()}</b>: {HOW[attr.kind === 'enum' ? round.hidden : attr.kind]}
            </div>
          )}
          {result && <Feedback result={result} attrKey={round.hidden} card={round.card} truthPretty={pretty(round.hidden, truth)} answer={revealed ? undefined : answer} revealed={revealed} />}
          <div className="actions">
            {!result && (
              <button className="btn reveal" type="button" onClick={reveal}>
                Reveal <span className="cost">−1 ♥</span>
              </button>
            )}
            <button className="btn primary" type="submit" disabled={!result && attr.kind !== 'text' && !answer}>
              {result ? 'Next card →' : 'Submit'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Feedback({
  result,
  attrKey,
  card,
  truthPretty,
  answer,
  revealed,
}: {
  result: Grade;
  attrKey: AttrKey;
  card: Card;
  truthPretty: string;
  answer?: string;
  revealed?: boolean;
}) {
  const ok = result.verdict === 'correct';
  return (
    <div className={`feedback ${ok ? 'ok' : 'bad'}`}>
      <div className="feedback-head">{ok ? '✓ Correct!' : revealed ? 'Revealed (−1 life)' : '✗ Not quite'}</div>
      {attrKey === 'text' ? (
        <>
          {!revealed && <div className="small">Match: {Math.round((result.score ?? 0) * 100)}% (need 70% and the right numbers)</div>}
          <div className="truth">
            <TextDiff truth={plainText(card.text)} matched={result.truthMatched} />
          </div>
        </>
      ) : (
        !ok && (
          <div>
            {answer ? (
              <>
                You said <b>{attrKey === 'name' ? answer : pretty(attrKey, ATTR[attrKey].kind === 'number' ? (answer === '' ? null : Number(answer)) : answer)}</b>.{' '}
              </>
            ) : null}
            It's <b>{truthPretty}</b>.
          </div>
        )
      )}
    </div>
  );
}

function Heart({ full, just, last }: { full: boolean; just: boolean; last: boolean }) {
  return (
    <svg className={`heart ${full ? 'full' : 'lost'} ${full && last ? 'last' : ''} ${just ? 'just' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2.1 4 6.3 4c2.3 0 3.9 1.3 5.7 3.4C13.8 5.3 15.4 4 17.7 4 21.9 4 23.6 8.4 22 11.7 19.5 16.4 12 21 12 21z" />
    </svg>
  );
}
