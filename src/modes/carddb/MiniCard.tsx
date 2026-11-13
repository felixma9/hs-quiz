import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../lib/types';
import { drawMini } from '../../card/sunwell';
import { Tilt } from '../../app/Tilt';

/**
 * A result's icon turned into a small version of the whole card, shown over the
 * icon while the mouse is on it, tilting toward the pointer like the full-size
 * card. The drawing comes from drawMini's cache (results are drawn ahead in
 * idle time), and it stays hidden until drawn, so the icon never blanks.
 */
export function MiniCard({ card }: { card: Card }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void drawMini(card).then((src) => {
      const c = canvas.current;
      if (!live || !c) return;
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')?.drawImage(src, 0, 0);
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
