import { useEffect, useRef, type ReactNode } from 'react';

/** Largest tilt in degrees as the pointer moves. */
const TILT_MAX = 14;
/** How much the card lifts while the pointer is on it. */
const HOVER_SCALE = 1.04;
const PERSPECTIVE = 1100;

/**
 * A card that tilts toward the pointer and lifts a little, with a soft shadow
 * that follows. On touch screens it follows the finger while pressed. Springs
 * ease it in and out, and the animation stops once the card is still.
 *
 * The motion (springs, stiffness and damping, shadow offset) is adapted from
 * React Bits' HoloCard (reactbits.dev, MIT + Commons Clause), without its
 * WebGL foil: that needs the card as a CORS-readable image, and our art isn't.
 * `active` off: the card settles flat and ignores the pointer.
 */
export function Tilt({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const rotor = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const pointer = useRef({ x: 0.5, y: 0.5, inside: false });
  const wake = useRef<() => void>(() => {});
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const s = { tiltX: 0, tiltY: 0, tiltVX: 0, tiltVY: 0, lift: 1, liftV: 0 };
    let raf = 0;
    let last = 0;
    let calm = 0;
    let alive = true;
    const spring = (v: number, vel: number, target: number, stiffness: number, damping: number, dt: number) => {
      const next = vel + ((target - v) * stiffness - vel * damping) * dt;
      return [v + next * dt, next];
    };
    const tick = (now: number) => {
      raf = 0;
      if (!alive) return;
      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
      last = now;
      const p = pointer.current;
      const on = p.inside && activeRef.current && !reduce;
      const targetX = on ? (0.5 - p.y) * 2 * TILT_MAX : 0;
      const targetY = on ? (p.x - 0.5) * 2 * TILT_MAX : 0;
      const lift = on ? HOVER_SCALE : 1;
      const steps = Math.ceil(dt / (1 / 240));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        [s.tiltX, s.tiltVX] = spring(s.tiltX, s.tiltVX, targetX, 150, 16, h);
        [s.tiltY, s.tiltVY] = spring(s.tiltY, s.tiltVY, targetY, 150, 16, h);
        [s.lift, s.liftV] = spring(s.lift, s.liftV, lift, 320, 30, h);
      }
      if (rotor.current) rotor.current.style.transform = `perspective(${PERSPECTIVE}px) scale(${s.lift}) rotateX(${s.tiltX}deg) rotateY(${s.tiltY}deg)`;
      if (shadow.current) {
        shadow.current.style.transform = `translate(${-s.tiltY * 0.7}px, ${s.tiltX * 0.7}px) scale(${0.9 + (s.lift - 1) * 1.5})`;
        shadow.current.style.opacity = String(Math.min(1, (s.lift - 1) / (HOVER_SCALE - 1)));
      }
      const motion =
        Math.abs(s.tiltVX) + Math.abs(s.tiltVY) + Math.abs(s.liftV) * 40 + Math.abs(s.tiltX - targetX) + Math.abs(s.tiltY - targetY);
      calm = motion > 0.02 ? 0 : calm + dt;
      // Keep going while the pointer is on the card (it may move again) or until it has settled.
      if (on || calm < 0.3) raf = requestAnimationFrame(tick);
    };
    wake.current = () => {
      if (raf || !alive) return;
      calm = 0;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Turning off (or on) eases the card to its new state.
  useEffect(() => wake.current(), [active]);

  const track = (e: React.PointerEvent) => {
    // On touch, only follow a finger that's pressed down.
    if (e.pointerType === 'touch' && e.type === 'pointermove' && !e.buttons) return;
    const r = root.current!.getBoundingClientRect();
    pointer.current = {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      inside: true,
    };
    wake.current();
  };
  const leave = () => {
    pointer.current = { ...pointer.current, inside: false };
    wake.current();
  };

  return (
    <div
      ref={root}
      className="tilt"
      onPointerEnter={track}
      onPointerMove={track}
      onPointerDown={track}
      onPointerUp={(e) => e.pointerType === 'touch' && leave()}
      onPointerLeave={leave}
      onPointerCancel={leave}
    >
      <span ref={shadow} className="tilt-shadow" aria-hidden="true" />
      <div ref={rotor} className="tilt-rotor">
        {children}
      </div>
    </div>
  );
}
