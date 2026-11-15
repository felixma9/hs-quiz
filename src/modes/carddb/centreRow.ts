import { useCallback, useRef, useSyncExternalStore } from 'react';
import { TOUCH } from '../../card/mini';

/**
 * On touch screens there is no mouse to hover with, so the results near the
 * middle of the screen show as small cards as the page scrolls: the row at the
 * middle fully, the rows above and below part-way, shrinking back into their
 * icons the further they are from it.
 *
 * Which results are near the middle comes from the browser (an
 * IntersectionObserver on a band around the middle line), so only those few
 * are measured while scrolling. Each one's closeness, 0 to 1, is written as
 * the CSS variable --p on it, straight from the scroll handler (no React
 * render), and the stylesheet turns that into the miniature's size and
 * opacity. React only re-renders when a result enters or leaves the band.
 */

/** How far from the middle line (px) a result still shows part-way: about a row and a half. */
const REACH = 190;
/** A result must stay in the band this long (ms) before its miniature is made, so a fast flick doesn't draw every row it passes. */
const SETTLE = 60;

const on = typeof IntersectionObserver === 'function' && TOUCH;

const NONE: ReadonlySet<string> = new Set();
/** Result elements being watched, and their card ids. */
const ids = new Map<Element, string>();
/** Results in the band right now. */
const near = new Set<Element>();
/** Cards whose miniature is made (what React sees). */
let shown: ReadonlySet<string> = NONE;
const listeners = new Set<() => void>();
let io: IntersectionObserver | null = null;
let ioHeight = 0;
let timer = 0;
let raf = 0;

/** Write each nearby result's closeness to the middle line. Reads every position first, then writes, so the page is laid out once. */
function place() {
  raf = 0;
  const mid = window.innerHeight / 2;
  const ps = [...near].map((el) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, 1 - Math.abs(r.top + r.height / 2 - mid) / REACH);
  });
  [...near].forEach((el, i) => {
    const s = (el as HTMLElement).style;
    s.setProperty('--p', ps[i].toFixed(3));
    // The closer, the higher: the middle row's cards sit over their neighbours'.
    s.zIndex = String(6 + Math.round(ps[i] * 10));
  });
}
function schedule() {
  if (!raf && near.size) raf = requestAnimationFrame(place);
}

function settle() {
  timer = 0;
  const next = new Set([...near].map((el) => ids.get(el)!));
  if (next.size === shown.size && [...next].every((id) => shown.has(id))) return;
  shown = next;
  listeners.forEach((f) => f());
}

function leave(el: Element) {
  if (!near.delete(el)) return;
  const s = (el as HTMLElement).style;
  s.removeProperty('--p');
  s.zIndex = '';
}

function observer(): IntersectionObserver {
  // The band is in pixels, so it's made again when the screen's height changes (turning the phone).
  if (io && ioHeight === window.innerHeight) return io;
  io?.disconnect();
  ioHeight = window.innerHeight;
  const margin = Math.min(0, REACH - ioHeight / 2);
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) near.add(e.target);
        else leave(e.target);
      }
      place();
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, SETTLE);
    },
    { rootMargin: `${margin}px 0px ${margin}px 0px` },
  );
  for (const el of ids.keys()) io.observe(el);
  return io;
}

if (on) {
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', () => ids.size && observer());
}

function subscribe(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** A ref for one result, and whether it's near the middle of the screen (always false with a mouse). */
export function useCentred(id: string): [(node: Element | null) => void, boolean] {
  const el = useRef<Element | null>(null);
  const ref = useCallback(
    (node: Element | null) => {
      if (!on) return;
      if (el.current) {
        observer().unobserve(el.current);
        ids.delete(el.current);
        leave(el.current);
      }
      el.current = node;
      if (node) {
        ids.set(node, id);
        observer().observe(node);
      }
    },
    [id],
  );
  const centred = useSyncExternalStore(subscribe, () => shown.has(id));
  return [ref, centred];
}
