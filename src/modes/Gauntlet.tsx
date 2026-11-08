import { useCallback, useMemo, useState } from 'react';
import type { Card } from '../lib/types';
import { ATTR, ATTRS, gradeAttr, labelFor, pretty, type AttrKey } from '../lib/attributes';
import { pickHidden, randomCard } from '../lib/cards';
import type { Grade } from '../lib/grade';
import { load, save } from '../lib/storage';
import { CardView } from '../components/CardView';
import { AnswerInput } from '../components/AnswerInput';
import { TextDiff } from '../components/TextDiff';

const LIVES = 3;
const BEST_KEY = 'hsq:gauntlet:best';
const SETTINGS_KEY = 'hsq:gauntlet:settings';

interface Settings {
  minionsOnly: boolean;
  allowed: AttrKey[];
}
const DEFAULT_SETTINGS: Settings = { minionsOnly: false, allowed: ATTRS.map((a) => a.key) };

interface Round {
  card: Card;
  hidden: AttrKey;
}

function newRound(pool: Card[], allowed: AttrKey[]): Round {
  for (let i = 0; i < 50; i++) {
    const card = randomCard(pool);
    const hidden = pickHidden(card, allowed);
    if (hidden) return { card, hidden };
  }
  const card = randomCard(pool);
  return { card, hidden: 'name' };
}

export function Gauntlet({ cards }: { cards: Card[] }) {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...load(SETTINGS_KEY, {}) }));
  const pool = useMemo(() => (settings.minionsOnly ? cards.filter((c) => c.type === 'MINION') : cards), [cards, settings.minionsOnly]);
  const [round, setRound] = useState<Round>(() => newRound(pool, settings.allowed));
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<Grade | null>(null);
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
  }, [pool, settings.allowed]);

  const submit = () => {
    if (result || over) return next();
    if (attr.kind === 'enum' && !answer) return;
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

  const restart = (s = settings) => {
    const p = s.minionsOnly ? cards.filter((c) => c.type === 'MINION') : cards;
    setScore(0);
    setLives(LIVES);
    setRound(newRound(p, s.allowed));
    setAnswer('');
    setResult(null);
  };

  const updateSettings = (s: Settings) => {
    if (!s.allowed.length) return;
    setSettings(s);
    save(SETTINGS_KEY, s);
    restart(s);
  };

  const hidden = useMemo(() => new Set<AttrKey>(result ? [] : [round.hidden]), [result, round.hidden]);
  const truth = attr.value(round.card);

  return (
    <div className="mode">
      <div className="hud">
        <span className="lives" aria-label={`${lives} lives`}>
          {'♥'.repeat(lives)}
          <span className="lost">{'♥'.repeat(LIVES - lives)}</span>
        </span>
        <span>
          Score <b>{score}</b>
        </span>
        <span className="muted">Best {best}</span>
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
          <div className="muted small">Attributes that can be hidden (changing restarts):</div>
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

      <CardView card={round.card} hidden={hidden} focus={round.hidden} />

      {over && result ? (
        <div className="panel center">
          <Feedback result={result} attrKey={round.hidden} card={round.card} truthPretty={pretty(round.hidden, truth)} />
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
          <div className="ask">
            What is this card's <b>{labelFor(attr, round.card).toLowerCase()}</b>?
          </div>
          {!result && (
            <AnswerInput
              key={round.card.id + round.hidden}
              attr={round.hidden}
              value={answer}
              onChange={setAnswer}
              onSubmit={submit}
              cards={cards}
              autoFocus={attr.kind !== 'enum'}
            />
          )}
          {result && <Feedback result={result} attrKey={round.hidden} card={round.card} truthPretty={pretty(round.hidden, truth)} answer={answer} />}
          <button className="btn primary" type="submit" disabled={!result && attr.kind === 'enum' && !answer}>
            {result ? 'Next card →' : 'Submit'}
          </button>
        </form>
      )}
    </div>
  );
}

function Feedback({ result, attrKey, card, truthPretty, answer }: { result: Grade; attrKey: AttrKey; card: Card; truthPretty: string; answer?: string }) {
  const ok = result.verdict === 'correct';
  return (
    <div className={`feedback ${ok ? 'ok' : 'bad'}`}>
      <div className="feedback-head">{ok ? '✓ Correct!' : '✗ Not quite'}</div>
      {attrKey === 'text' ? (
        <>
          <div className="small">Match: {Math.round((result.score ?? 0) * 100)}% (need 85% and the right numbers)</div>
          <div className="truth">
            <TextDiff truth={card.text ?? ''} matched={result.truthMatched} />
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
