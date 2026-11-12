import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type VerdictTone = 'ok' | 'bad';

export interface Verdict {
  tone: VerdictTone;
  text: string;
  /** Changes for every new verdict, so the same text twice in a row still flashes. */
  id: string | number;
  /** No banner: a small tick when right, nothing visible when wrong (the text is still read out). */
  minimal?: boolean;
}

/** How long the banner stays up; the small tick goes sooner. */
const SHOW_MS = 1100;
const TICK_MS = 650;

/**
 * A big right/wrong banner across the middle of the screen. It pops in, then
 * fades away by itself; it never blocks taps. Hiding runs on a timer, not the
 * animation, so it still shows (without the pop) when motion is reduced.
 */
export function VerdictFlash({ verdict }: { verdict: Verdict | null }) {
  const [shown, setShown] = useState<Verdict | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Each new verdict restarts the timers. The verdict going away (the next question
  // starting) doesn't stop them: that used to leave the flash up until the next answer.
  useEffect(() => {
    if (!verdict) return;
    timers.current.forEach(clearTimeout);
    const ms = verdict.minimal ? TICK_MS : SHOW_MS;
    setShown(verdict);
    setLeaving(false);
    timers.current = [setTimeout(() => setLeaving(true), ms - 220), setTimeout(() => setShown(null), ms)];
    // A new verdict is a new id; the object itself may be rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict?.id]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!shown) return null;
  // Minimal and wrong: nothing to see (the screen shows it its own way), just read out.
  if (shown.minimal && shown.tone === 'bad')
    return createPortal(
      <div className="sr-only" role="status" aria-live="assertive" key={shown.id}>
        {shown.text}
      </div>,
      document.body,
    );
  if (shown.minimal)
    return createPortal(
      <div className={`verdict-check ${leaving ? 'leaving' : ''}`} role="status" aria-live="assertive" aria-label={shown.text} key={shown.id}>
        <CheckMark />
      </div>,
      document.body,
    );
  return createPortal(
    <div className={`verdict-flash ${shown.tone} ${leaving ? 'leaving' : ''}`} role="status" aria-live="assertive" key={shown.id}>
      <span className="verdict-flash-mark" aria-hidden="true">
        {shown.tone === 'ok' ? '✓' : '✗'}
      </span>
      <span className="verdict-flash-text">{shown.text}</span>
    </div>,
    document.body,
  );
}

/**
 * A chunky green tick with a gold rim and a dark outline, drawn in three
 * strokes of the same path (outline, rim, fill) plus a highlight. Original art
 * in the spirit of the game's quest-complete tick.
 */
function CheckMark() {
  const d = 'M22 55 L42 74 L80 27';
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="vc-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1bf" />
          <stop offset="0.45" stopColor="#e2b65a" />
          <stop offset="1" stopColor="#8a5a1c" />
        </linearGradient>
        <linearGradient id="vc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c6f59a" />
          <stop offset="0.5" stopColor="#4cb544" />
          <stop offset="1" stopColor="#1f6e25" />
        </linearGradient>
      </defs>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path className="vc-outline" d={d} stroke="#1f1405" strokeWidth="24" />
        <path className="vc-rim" d={d} stroke="url(#vc-rim)" strokeWidth="18" />
        <path className="vc-fill" d={d} stroke="url(#vc-fill)" strokeWidth="10" />
        <path className="vc-shine" d="M27 54 L41 67" stroke="rgba(255, 255, 255, 0.55)" strokeWidth="3" />
      </g>
    </svg>
  );
}

/**
 * A soft glow that swells up behind a card and fades: green when right, red
 * when wrong. Put it first inside the card's box; give it a new key for each
 * answer so it plays again.
 */
export function CardGlow({ tone }: { tone: VerdictTone }) {
  return <span className={`card-glow ${tone}`} aria-hidden="true" />;
}

