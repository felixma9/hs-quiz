import { useLayoutEffect, useRef, useState } from 'react';
import type { Card } from '../../lib/types';
import { drawMini, miniNow } from '../../card/sunwell';
import { Tilt } from '../../app/Tilt';

/** Copy a drawn miniature onto a canvas of our own. */
export function copyMini(src: HTMLCanvasElement, to: HTMLCanvasElement) {
  to.width = src.width;
  to.height = src.height;
  to.getContext('2d')?.drawImage(src, 0, 0);
}

/**
 * A result's icon turned into a small version of the whole card while the
 * mouse is on it, over the icon, tilting toward the pointer like the
 * full-size card. Results are drawn ahead in idle time, so it is usually
 * already drawn and goes on screen in the same frame as the hover; otherwise
 * it stays hidden until drawn, so the icon never blanks.
 */
export function MiniCard({ card }: { card: Card }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(() => miniNow(card) !== null);
  // Before the browser paints, so a drawn one never shows a blank frame first.
  useLayoutEffect(() => {
    const c = canvas.current;
    const now = miniNow(card);
    if (now && c) {
      copyMini(now, c);
      setReady(true);
      return;
    }
    setReady(false);
    let live = true;
    void drawMini(card).then((src) => {
      if (!live || !canvas.current) return;
      copyMini(src, canvas.current);
      setReady(true);
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
