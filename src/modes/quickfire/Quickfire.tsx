import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
export function Quickfire({ cards, all }: { cards: Card[]; all: Card[] }) {
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
  const field = useRef<HTMLInputElement>(null);
  const poolIds = useMemo(() => new Set(cards.map((c) => c.id)), [cards]);

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
    if (score > best) {
      setBest(score);
      save(BEST_KEY, score);
    }
  }, [phase, left, prompt, score, best]);

  const start = () => {
    const fresh = new Set<string>();
    setUsed(fresh);
    setTurns([]);
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
    if (!poolIds.has(c.id)) return say(false, `${c.name} isn't in your card pool`);
    if (used.has(c.id)) return say(false, `You already used ${c.name}`);
    if (!prompt.test(c)) return say(false, `${c.name} ${prompt.why(c)}`);
    const u = new Set(used).add(c.id);
    setUsed(u);
    setTurns((ts) => [...ts, { prompt, card: c }]);
    say(true, c.name);
    next(u);
  };

  const skip = () => {
    if (phase !== 'playing') return;
    setTurns((ts) => [...ts, { prompt, card: null }]);
    setEndAt((e) => e - SKIP_PENALTY * 1000);
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
        <span key={urgent ? Math.ceil(left) : 'calm'} className={`qf-clock ${urgent ? 'urgent' : ''}`} aria-label={`${Math.ceil(left)} seconds left`}>
          {phase === 'playing' ? Math.ceil(left) : phase === 'over' ? 0 : ROUND_SECONDS}
          <small>s</small>
        </span>
        <span className={`stat score ${score > 0 && score >= best ? 'record' : ''}`}>
          <span className="stat-label">Score</span>
          <b key={score} className="stat-value">{score}</b>
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
        <Results turns={turns} score={score} best={best} onAgain={start} crop={crop} />
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

function Results({ turns, score, best, onAgain, crop }: { turns: Turn[]; score: number; best: number; onAgain(): void; crop: Record<string, number> }) {
  return (
    <div className="panel qf-results">
      <h2>Time!</h2>
      <p>
        You named <b>{score}</b> card{score === 1 ? '' : 's'}. Best: {best}.
      </p>
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
function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (
        <Fragment key={i}>{i % 2 ? <b>{part}</b> : part}</Fragment>
      ))}
    </>
  );
}
