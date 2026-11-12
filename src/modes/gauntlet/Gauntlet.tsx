import { ICON } from '../../app/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Card } from '../../lib/types';
import { ATTR, ATTRS, gradeAttr, labelFor, plainText, pretty, type AttrKey } from '../../lib/attributes';
import { newRound, howTo, type Round } from './round';
import { giveaways } from '../../lib/cards';
import type { Grade } from '../../lib/grade';
import { load, save } from '../../lib/storage';
import { GameCard } from '../../card/GameCard';
import { Art, useArtCrop } from '../hsdle/Art';
import { zoomCard } from '../../app/CardZoom';
import { TextDiff } from './TextDiff';
import { CardGlow, VerdictFlash } from '../../app/VerdictFlash';
import { loadSettings, saveSettings, type GauntletSettings as Settings } from './settings';

const LIVES = 3;
const BEST_KEY = 'hsq:gauntlet:best';

/** One answered card, for the end-of-run summary. */
interface Played extends Round {
  ok: boolean;
}

export function Gauntlet({ cards }: { cards: Card[] }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const pool = useMemo(() => (settings.minionsOnly ? cards.filter((c) => c.type === 'MINION') : cards), [cards, settings.minionsOnly]);
  // Fields with only one possible answer in the pool: worked out once per pool, not every card.
  const free = useMemo(() => giveaways(pool), [pool]);
  const [round, setRound] = useState<Round>(() => newRound(pool, settings.allowed, Math.random, undefined, free));
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<Grade | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [best, setBest] = useState<number>(() => load(BEST_KEY, 0));
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<Played[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  // Best score before this run, so the end screen can say "New best!".
  const [startBest, setStartBest] = useState(best);

  const over = lives === 0;
  const attr = ATTR[round.hidden];

  const next = useCallback(() => {
    setRound(newRound(pool, settings.allowed, Math.random, undefined, free));
    setAnswer('');
    setResult(null);
    setRevealed(false);
  }, [pool, settings.allowed, free]);

  const submit = () => {
    if (result || over) return next();
    if (attr.kind !== 'text' && !answer) return;
    // Card text is graded as forgivingly as in Gauntlet PvP.
    const g = gradeAttr(round.hidden, answer, round.card, true);
    setResult(g);
    const ok = g.verdict === 'correct';
    setHistory((h) => [...h, { ...round, ok }]);
    setStreak(ok ? streak + 1 : 0);
    if (ok) setBestStreak((b) => Math.max(b, streak + 1));
    if (ok) {
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
    setHistory((h) => [...h, { ...round, ok: false }]);
    setStreak(0);
    setLives((l) => l - 1);
  };

  const restart = (s = settings) => {
    const p = s === settings ? pool : s.minionsOnly ? cards.filter((c) => c.type === 'MINION') : cards;
    setScore(0);
    setLives(LIVES);
    setHistory([]);
    setStreak(0);
    setBestStreak(0);
    setStartBest(best);
    setRound(newRound(p, s.allowed, Math.random, undefined, p === pool ? free : giveaways(p)));
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
    // Re-subscribes only when the answer is shown (each answer sets a new result), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, over]);

  const hidden = useMemo(() => new Set<AttrKey>(result ? [] : [round.hidden]), [result, round.hidden]);
  const truth = attr.value(round.card);

  return (
    <div className="mode">
      <VerdictFlash
        verdict={
          result
            ? {
                tone: result.verdict === 'correct' ? 'ok' : 'bad',
                text: result.verdict === 'correct' ? 'Correct!' : revealed ? 'Revealed' : 'Wrong!',
                id: history.length,
                // No banners: a right answer gets a small tick, a miss only a red glow behind
                // the card (CardGlow below). Both are still read out.
                minimal: true,
              }
            : null
        }
      />
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
          <div className="muted small">Blanks to ask (changing restarts):</div>
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

      <div className={`gauntlet-card ${result ? (result.verdict === 'correct' ? 'got' : 'miss') : ''}`}>
        {result && <CardGlow key={history.length} tone={result.verdict === 'correct' ? 'ok' : 'bad'} />}
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
      </div>

      {over && result ? (
        <div className="panel center party-over gauntlet-over">
          <Feedback result={result} attrKey={round.hidden} card={round.card} truthPretty={pretty(round.hidden, truth)} answer={revealed ? undefined : answer} revealed={revealed} />
          <div className="over-head">
            <span className="over-kicker">Game over</span>
            <h2>{score > startBest ? 'New best!' : score ? 'Nice run' : 'Out of lives'}</h2>
          </div>
          <div className={`solo-final ${score > startBest ? 'record' : ''}`}>
            <b className="qf-count done">{score}</b>
            <span>{score === 1 ? 'card' : 'cards'}</span>
          </div>
          <div className="solo-stats">
            <span>
              <small>Best</small>
              <b>{best}</b>
            </span>
            <span>
              <small>Longest streak</small>
              <b>{bestStreak}</b>
            </span>
            <span>
              <small>Correct</small>
              <b>
                {score}
                <i className="of">/{history.length}</i>
              </b>
            </span>
          </div>
          <RunStrip history={history} />
          <button className="btn primary" onClick={() => restart()}>
            Play again
          </button>
          <button
            className="btn"
            onClick={() => {
              setShowSettings(true);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            Change settings
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
              Fill in the <b>{labelFor(attr, round.card).toLowerCase()}</b>: {howTo(round.hidden)}
            </div>
          )}
          {result && <Feedback result={result} attrKey={round.hidden} card={round.card} truthPretty={pretty(round.hidden, truth)} answer={revealed ? undefined : answer} revealed={revealed} />}
          <div className="actions">
            {!result && (
              <button className="btn reveal" type="button" onClick={reveal}>
                Reveal <span className="cost">−1 <img className="cost-drop" src={ICON.health} alt="life" /></span>
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
          {!revealed && <div className="small">{Math.round((result.score ?? 0) * 100)}% of key words (~50% passes)</div>}
          <div className="truth">
            <TextDiff truth={plainText(card.text)} matched={result.truthMatched} />
          </div>
        </>
      ) : ok ? (
        <div>
          It's <b>{truthPretty}</b>.
        </div>
      ) : (
        <div>
          {answer ? (
            <>
              You said <b>{attrKey === 'name' ? answer : pretty(attrKey, ATTR[attrKey].kind === 'number' ? (answer === '' ? null : Number(answer)) : answer)}</b>.{' '}
            </>
          ) : null}
          It's <b>{truthPretty}</b>.
        </div>
      )}
    </div>
  );
}

/** Every card from the run as a strip of art, marked right or wrong. Tap one for what was asked. */
function RunStrip({ history }: { history: Played[] }) {
  const crop = useArtCrop();
  const [open, setOpen] = useState<number | null>(null);
  if (!history.length) return null;
  const sel = open !== null ? history[open] : null;
  return (
    <section className="named">
      <div className="lobby-head">
        <span className="section-label">This run</span>
        <span className="count-pill">{history.length}</span>
      </div>
      <div className="named-strip">
        {history.map((x, i) => (
          <button
            key={i}
            type="button"
            className={`named-card run-card ${x.ok ? 'ok' : 'bad'} ${open === i ? 'on' : ''}`}
            style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
            title={x.card.name}
            aria-label={`${x.card.name}: ${x.ok ? 'right' : 'wrong'}`}
            onClick={() => {
              setOpen(i);
              zoomCard(x.card, `Asked for the ${labelFor(ATTR[x.hidden], x.card).toLowerCase()}: ${x.ok ? 'right' : 'missed'}`);
            }}
          >
            <Art card={x.card} crop={crop} className="named-art" />
            <span className="run-mark">{x.ok ? '✓' : '✗'}</span>
          </button>
        ))}
      </div>
      <div className="named-caption muted small">
        {sel ? (
          <>
            <b>{sel.card.name}</b> · {labelFor(ATTR[sel.hidden], sel.card).toLowerCase()} {sel.ok ? 'right' : 'missed'}
            {sel.hidden !== 'name' && sel.hidden !== 'text' && (
              <>
                : <b>{pretty(sel.hidden, ATTR[sel.hidden].value(sel.card))}</b>
              </>
            )}
          </>
        ) : (
          'Tap a card to see it'
        )}
      </div>
    </section>
  );
}

function Heart({ full, just, last }: { full: boolean; just: boolean; last: boolean }) {
  // Hearthstone's health drop stands in for a life.
  return (
    <img
      className={`heart ${full ? 'full' : 'lost'} ${full && last ? 'last' : ''} ${just ? 'just' : ''}`}
      src={ICON.health}
      alt=""
      draggable={false}
    />
  );
}
