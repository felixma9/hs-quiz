import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '../../lib/types';
import { drawMini } from '../../card/sunwell';

/** The miniature's width on screen, and its distance from the pointer. */
const W = 150;
const H = (W * 746) / 500;
const GAP = 18;
/** Most the card turns as the pointer crosses the icon, in degrees. */
const TILT = 10;

/**
 * A small version of the whole card that follows the mouse while it is over a
 * result: beside the pointer (to its right, or its left near the screen's
 * edge), turning a little as the pointer crosses the icon. It moves by writing
 * its position straight to the element, never through React, and it never
 * takes the pointer, so it can't get in the way of the click that opens the
 * card. The drawing comes from drawMini's cache (results are drawn ahead in
 * idle time); until it is ready nothing is shown.
 */
export function MiniCard({ card, anchor, at }: { card: Card; anchor: HTMLElement; at: { x: number; y: number } }) {
  const box = useRef<HTMLDivElement>(null);
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

  // Follow the pointer.
  useLayoutEffect(() => {
    const place = (x: number, y: number) => {
      const el = box.current;
      if (!el) return;
      const right = x + GAP + W <= window.innerWidth - 8;
      const left = right ? x + GAP : x - GAP - W;
      const top = Math.min(Math.max(8, y - H / 2), window.innerHeight - H - 8);
      // Where the pointer is across the icon, -1..1 each way: the card leans toward it.
      const r = anchor.getBoundingClientRect();
      const px = Math.min(1, Math.max(-1, ((x - r.left) / r.width) * 2 - 1));
      const py = Math.min(1, Math.max(-1, ((y - r.top) / r.height) * 2 - 1));
      el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
      el.style.setProperty('--ry', `${(px * TILT).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-py * TILT).toFixed(2)}deg`);
    };
    place(at.x, at.y);
    const onMove = (e: PointerEvent) => place(e.clientX, e.clientY);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  return createPortal(
    <div ref={box} className={`mini ${ready ? 'ready' : ''}`} style={{ width: W }} aria-hidden="true">
      <canvas ref={canvas} />
    </div>,
    document.body,
  );
}
