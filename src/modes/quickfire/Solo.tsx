import { Fragment, useEffect, useRef, useState } from 'react';
import type { Card } from '../../lib/types';
import { load, save } from '../../lib/storage';
import { Art, useArtCrop } from '../hsdle/Art';
import { findCard, makePrompt, type Prompt } from './prompts';

const ROUND_SECONDS = 60;
const SKIP_PENALTY = 3;
const BEST_KEY = 'hsq:quickfire:best';

interface Turn {
  prompt: Prompt;
  /** The card that answered it, or null if skipped / time ran out. */
  card: Card | null;
}

type Phase = 'ready' | 'playing' | 'over';

/**
 * Quickfire: a minute of "Name a minion with 4 Attack", "Finish the spell
 * name: Fire…". Any card in the pool that fits counts, once per run.
 */
export function Solo({ cards, all }: { cards: Card[]; all: Card[] }) {
  const crop = useArtCrop();
  const [phase, setPhase] = useState<Phase>('ready');
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState<Prompt>(() => makePrompt(cards));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string; n: number } | null>(null);
  const [endAt, setEndAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [best, setBest] = useState<number>(() => load(BEST_KEY, 0));
  const [newBest, setNewBest] = useState(false);
  /** Correct answers in a row (a skip breaks it). */
  const [streak, setStreak] = useState(0);
  /** Counts skips, so each one replays the "−3s" float. */
  const [skips, setSkips] = useState(0);
  const field = useRef<HTMLInputElement>(null);

  const score = turns.filter((t) => t.card).length;
  const left = Math.max(0, endAt - now) / 1000;

  // Tick the clock while playing.
  useEffect(() => {
    if (phase !== 'playing') return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [phase]);

  // Time's up: record the open prompt as missed and save the best.
  useEffect(() => {
    if (phase !== 'playing' || left > 0) return;
    setPhase('over');
    setTurns((ts) => [...ts, { prompt, card: null }]);
    field.current?.blur();
    setNewBest(score > best);
    if (score > best) {
      setBest(score);
      save(BEST_KEY, score);
    }
  }, [phase, left, prompt, score, best]);

  const start = () => {
    const fresh = new Set<string>();
    setUsed(fresh);
    setTurns([]);
    setStreak(0);
    setSkips(0);
    setPrompt(makePrompt(cards, fresh));
    setInput('');
    setMsg(null);
    setEndAt(Date.now() + ROUND_SECONDS * 1000);
    setNow(Date.now());
    setPhase('playing');
    // Focus inside the tap so phones open the keyboard.
    field.current?.focus();
  };

  const say = (ok: boolean, text: string) => {
    setMsg((m) => ({ ok, text, n: (m?.n ?? 0) + 1 }));
    // Restart the shake animation on every miss.
    const el = field.current;
    if (!ok && el) {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
  };

  const next = (u: Set<string>) => {
    setPrompt(makePrompt(cards, u));
    setInput('');
  };

  const submit = () => {
    if (phase !== 'playing' || !input.trim()) return;
    const c = findCard(input, all);
    if (!c) return say(false, `No card called "${input.trim()}"`);
    if (used.has(c.id)) return say(false, `You already used ${c.name}`);
    if (!prompt.test(c)) return say(false, `${c.name} ${prompt.why(c)}`);
    const u = new Set(used).add(c.id);
    setUsed(u);
    setTurns((ts) => [...ts, { prompt, card: c }]);
    setStreak((n) => n + 1);
    say(true, c.name);
    next(u);
  };

  const skip = () => {
    if (phase !== 'playing') return;
    setTurns((ts) => [...ts, { prompt, card: null }]);
    setEndAt((e) => e - SKIP_PENALTY * 1000);
    setStreak(0);
    setSkips((n) => n + 1);
    const ex = prompt.answers.find((c) => !used.has(c.id));
    say(false, ex ? `Skipped: e.g. ${ex.name}` : 'Skipped');
    next(used);
    field.current?.focus();
  };

  const answered = turns.filter((t) => t.card).slice(-6).reverse();
  const urgent = phase === 'playing' && left <= 10;

  return (
    <div className="mode quickfire">
      <div className="hud">
        <span className="qf-float-anchor">
          <span key={urgent ? Math.ceil(left) : 'calm'} className={`qf-clock ${urgent ? 'urgent' : ''}`} aria-label={`${Math.ceil(left)} seconds left`}>
            {phase === 'playing' ? Math.ceil(left) : phase === 'over' ? 0 : ROUND_SECONDS}
            <small>s</small>
          </span>
          {phase === 'playing' && skips > 0 && (
            <span key={`minus-${skips}`} className="qf-float minus" aria-hidden="true">
              −{SKIP_PENALTY}s
            </span>
          )}
        </span>
        <span className={`stat score ${score > 0 && score >= best ? 'record' : ''}`}>
          <span className="stat-label">Score</span>
          <b key={score} className="stat-value">{score}</b>
          {phase === 'playing' && score > 0 && (
            <span key={`plus-${score}`} className="qf-float plus" aria-hidden="true">
              +1
            </span>
          )}
        </span>
        <span className="stat best">
          <span className="stat-label">Best</span>
          <b className="stat-value">{best}</b>
        </span>
      </div>
      <div className="qf-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${phase === 'ready' ? 1 : left / ROUND_SECONDS})` }} className={urgent ? 'urgent' : ''} />
      </div>

      {phase === 'over' ? (
        <Results turns={turns} score={score} best={best} newBest={newBest} onAgain={start} crop={crop} />
      ) : (
        <>
          <div className={`qf-prompt ${msg?.ok && phase === 'playing' ? 'after-hit' : ''}`} key={phase === 'ready' ? 'ready' : prompt.text + turns.length}>
            {phase === 'ready' ? (
              <>
                <div className="qf-text">Name as many cards as you can in {ROUND_SECONDS} seconds.</div>
                <div className="muted small">Any card from your pool that fits counts, once each. Skipping costs {SKIP_PENALTY}s.</div>
              </>
            ) : (
              <>
                <div className="qf-text">
                  <Bold text={prompt.text} />
                </div>
                {prompt.hint && <div className="muted small">{prompt.hint}</div>}
              </>
            )}
          </div>

          <form
            className="qf-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (phase === 'ready') start();
              else submit();
            }}
          >
            <input
              ref={field}
              className="in qf-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={phase === 'ready' ? 'Card names go here' : 'Card name'}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="go"
              aria-label="Card name"
            />
            {phase === 'ready' ? (
              <button type="button" className="btn primary qf-start" onClick={start}>
                Start
              </button>
            ) : (
              <>
                <button type="submit" className="btn primary" onMouseDown={(e) => e.preventDefault()} disabled={!input.trim()}>
                  Go
                </button>
                <button type="button" className="btn qf-skip" onMouseDown={(e) => e.preventDefault()} onClick={skip}>
                  Skip
                </button>
              </>
            )}
          </form>

          <div className={`qf-msg ${msg ? (msg.ok ? 'ok' : 'bad') : ''}`} key={msg?.n} aria-live="polite">
            {msg ? (msg.ok ? `✓ ${msg.text}` : msg.text) : ' '}
            {msg?.ok && streak >= 3 && <span className="qf-streak">🔥 {streak} in a row</span>}
          </div>

          {answered.length > 0 && (
            <div className="qf-recent">
              {answered.map((t) => (
                <figure key={t.card!.id} className="qf-chip">
                  <Art card={t.card!} crop={crop} className="qf-thumb" />
                  <figcaption>{t.card!.name}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Results({
  turns,
  score,
  best,
  newBest,
  onAgain,
  crop,
}: {
  turns: Turn[];
  score: number;
  best: number;
  newBest: boolean;
  onAgain(): void;
  crop: Record<string, number>;
}) {
  return (
    <div className="panel qf-results">
      <h2>Time!</h2>
      <div className="qf-final">
        <CountUp to={score} />
        <span className="muted small">card{score === 1 ? '' : 's'} named</span>
      </div>
      {newBest ? <div className="qf-newbest">New best!</div> : <p className="muted small">Best: {best}</p>}
      <button className="btn primary" onClick={onAgain}>
        Play again
      </button>
      <ol className="qf-log">
        {turns.map((t, i) => (
          <li key={i} className={t.card ? 'ok' : 'miss'} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
            <div className="qf-log-prompt">
              <Bold text={t.prompt.text} />
            </div>
            {t.card ? (
              <div className="qf-log-answer">
                <Art card={t.card} crop={crop} className="qf-thumb" />
                {t.card.name}
              </div>
            ) : (
              <div className="qf-log-answer muted">
                {t.prompt.answers.length
                  ? `e.g. ${t.prompt.answers
                      .slice(0, 3)
                      .map((c) => c.name)
                      .join(', ')}`
                  : 'Skipped'}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Render **bold** markers. */
export function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (
        <Fragment key={i}>{i % 2 ? <b>{part}</b> : part}</Fragment>
      ))}
    </>
  );
}

/** A number that counts up quickly from 0 (instant for reduced motion). */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || to === 0) return setN(to);
    const ms = Math.min(700, 120 + to * 45);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <b className={`qf-count ${n === to ? 'done' : ''}`}>{n}</b>;
}
