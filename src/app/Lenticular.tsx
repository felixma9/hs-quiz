import { useEffect, useRef, type ReactNode } from 'react';

/** Lens ribs across the card. */
const STRIPS = 48;
/** How far the turn lags from the left rib to the right one (0: all turn together). */
const SWEEP = 0.6;
/** Share of the card's width the pointer crosses to turn every rib. */
const TRAVEL = 0.7;
/** Degrees the card turns as the pointer crosses it. */
const TILT = 12;

/**
 * Two faces in one card, like a lenticular print: moving the pointer across it
 * turns vertical ribs one after another from `front` to `back`, with the card
 * tilting and a ribbed sheen. On touch screens, press and hold to turn it.
 * `active` off: just the front, still.
 */
export function Lenticular({ front, back, active, backLabel }: { front: ReactNode; back?: ReactNode; active: boolean; backLabel?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  // Kept off React state: it changes every frame while the pointer moves, and re-rendering would redraw nothing but cost a lot.
  const turned = useRef(0);
  const anim = useRef(0);
  const lens = active && !!back;

  // Draw the ribs for how far the turn has got (0..1) into a 1px-tall mask: opaque = front shows.
  const paint = (t: number) => {
    const el = top.current;
    if (!el) return;
    const c = (mask.current ??= Object.assign(document.createElement('canvas'), { width: STRIPS * 8, height: 1 }));
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, 1);
    g.fillStyle = '#000';
    for (let k = 0; k < STRIPS; k++) {
      const open = Math.min(1, Math.max(0, t * (1 + SWEEP) - (k / STRIPS) * SWEEP));
      g.fillRect(k * 8, 0, Math.round(8 * (1 - open)), 1);
    }
    const url = `url(${c.toDataURL()})`;
    el.style.maskImage = url;
    el.style.webkitMaskImage = url;
    const b = box.current!;
    b.style.setProperty('--turn', t.toFixed(3));
    // Tilt and sheen peak halfway through the turn and settle flat at either end.
    b.style.setProperty('--lift', (4 * t * (1 - t)).toFixed(3));
    b.classList.toggle('turned', t > 0.5);
    turned.current = t;
  };

  useEffect(() => {
    if (lens) paint(0);
    else if (top.current) {
      top.current.style.maskImage = '';
      top.current.style.webkitMaskImage = '';
      box.current?.style.setProperty('--turn', '0');
      box.current?.style.setProperty('--lift', '0');
      box.current?.classList.remove('turned');
      turned.current = 0;
    }
    return () => cancelAnimationFrame(anim.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens]);

  /** Ease the turn to `to` (touch, and letting go with the mouse). */
  const tween = (to: number) => {
    cancelAnimationFrame(anim.current);
    const from = turned.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 420);
      const e = 1 - (1 - k) ** 3;
      paint(from + (to - from) * e);
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!lens || e.pointerType !== 'mouse') return;
    const r = box.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    cancelAnimationFrame(anim.current);
    paint(Math.min(1, Math.max(0, (x - (1 - TRAVEL) / 2) / TRAVEL)));
  };

  return (
    <div
      ref={box}
      className={`lens ${lens ? 'on' : ''}`}
      style={{ '--tilt': `${TILT}deg`, '--strips': STRIPS } as React.CSSProperties}
      onPointerMove={onMove}
      onPointerLeave={(e) => lens && e.pointerType === 'mouse' && tween(0)}
      onPointerDown={(e) => lens && e.pointerType !== 'mouse' && tween(1)}
      onPointerUp={(e) => lens && e.pointerType !== 'mouse' && tween(0)}
      onPointerCancel={() => lens && tween(0)}
      onContextMenu={(e) => lens && e.preventDefault()}
    >
      <div className="lens-card">
        {lens && <div className="lens-face lens-back">{back}</div>}
        <div ref={top} className="lens-face lens-front">
          {front}
        </div>
        {lens && <div className="lens-ribs" aria-hidden="true" />}
        {lens && <div className="lens-foil" aria-hidden="true" />}
      </div>
      {lens && backLabel && (
        <span className="lens-label">
          {backLabel}
        </span>
      )}
    </div>
  );
}
