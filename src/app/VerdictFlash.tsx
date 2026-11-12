import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type VerdictTone = 'ok' | 'bad';

export interface Verdict {
  tone: VerdictTone;
  text: string;
  /** Changes for every new verdict, so the same text twice in a row still flashes. */
  id: string | number;
  /** Just a checkmark, no banner (the text is still read out). */
  minimal?: boolean;
}

/** How long the banner stays up. */
const SHOW_MS = 1100;

/**
 * A big right/wrong banner across the middle of the screen. It pops in, then
 * fades away by itself; it never blocks taps. Hiding runs on a timer, not the
 * animation, so it still shows (without the pop) when motion is reduced.
 */
export function VerdictFlash({ verdict }: { verdict: Verdict | null }) {
  const [shown, setShown] = useState<Verdict | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!verdict) return;
    setShown(verdict);
    setLeaving(false);
    const fade = setTimeout(() => setLeaving(true), SHOW_MS - 250);
    const hide = setTimeout(() => setShown(null), SHOW_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(hide);
    };
    // A new verdict is a new id; the object itself may be rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict?.id]);

  if (!shown) return null;
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
