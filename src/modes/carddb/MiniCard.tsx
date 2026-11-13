import { useLayoutEffect, useRef, useState } from 'react';
import type { Card } from '../../lib/types';
import { paintMini, prepareMini, warmAround } from '../../card/mini';
import { Tilt } from '../../app/Tilt';

/**
 * A result's icon turned into a small version of the whole card while the
 * mouse is on it, over the icon, tilting toward the pointer like the
 * full-size card. Miniatures are kept ready ahead (mini.ts), so it's
 * usually painted before the browser shows the hover at all; otherwise it
 * stays hidden until ready, so the icon never blanks.
 */
export function MiniCard({ card }: { card: Card }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(true);
  // Before the browser paints, so a ready one never shows a blank frame first.
  useLayoutEffect(() => {
    warmAround(card);
    if (canvas.current && paintMini(canvas.current, card)) return setReady(true);
    setReady(false);
    let live = true;
    void prepareMini(card).then(() => {
      if (live && canvas.current && paintMini(canvas.current, card)) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [card]);
  return (
    <span className={`mini ${ready ? 'ready' : ''}`} aria-hidden="true">
      <Tilt>
        <canvas ref={canvas} />
      </Tilt>
    </span>
  );
}
