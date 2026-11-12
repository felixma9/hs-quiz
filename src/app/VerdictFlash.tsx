import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type VerdictTone = 'ok' | 'bad';

export interface Verdict {
  tone: VerdictTone;
  text: string;
  /** Changes for every new verdict, so the same text twice in a row still flashes. */
  id: string | number;
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
