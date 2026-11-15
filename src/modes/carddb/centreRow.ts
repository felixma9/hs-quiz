import { useCallback, useRef, useSyncExternalStore } from 'react';
import { TOUCH } from '../../card/mini';

/**
 * On touch screens there is no mouse to hover with, so the row of results at
 * the middle of the screen is the one shown as small cards, changing as the
 * page scrolls.
 *
 * The browser tells us which results cross the screen's middle line (an
 * IntersectionObserver with the viewport shrunk to that line), so nothing is
 * measured while scrolling and the scroll itself never waits on this. Results
 * in a row are the same height, so the line crosses one whole row at a time.
 */

/** A row must stay in the middle this long (ms) to turn into cards, so a fast flick doesn't strobe through every row. */
const SETTLE = 50;

const NONE: ReadonlySet<string> = new Set();
const ids = new Map<Element, string>();
/** Results the middle line crosses right now. */
const crossing = new Set<string>();
/** The row shown as cards. */
let centred: ReadonlySet<string> = NONE;
const listeners = new Set<() => void>();
/** The whole list of results: once the line leaves it, no row is shown as cards. */
let area: Element | null = null;
let inArea = false;
let io: IntersectionObserver | null = null;
let timer = 0;

function settle() {
  timer = 0;
  // Between two rows (or on a heading): the last row stays.
  const next = !inArea ? NONE : crossing.size ? new Set(crossing) : centred;
  if (next.size === centred.size && [...next].every((id) => centred.has(id))) return;
  centred = next;
  listeners.forEach((f) => f());
}
function changed() {
  window.clearTimeout(timer);
  timer = window.setTimeout(settle, SETTLE);
}

function observer(): IntersectionObserver {
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.target === area) {
          inArea = e.isIntersecting;
          continue;
        }
        const id = ids.get(e.target);
        if (!id) continue;
        if (e.isIntersecting) crossing.add(id);
        else crossing.delete(id);
      }
      changed();
    },
    { rootMargin: '-50% 0px -50% 0px' },
  );
  return io;
}

/** Ref for the element holding all the results. */
export function centreArea(node: Element | null) {
  if (!TOUCH || typeof IntersectionObserver !== 'function') return;
  if (area) observer().unobserve(area);
  area = node;
  inArea = false;
  if (node) observer().observe(node);
  else changed();
}

function subscribe(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** A ref for one result, and whether it's in the row at the middle of the screen (always false with a mouse). */
export function useCentred(id: string): [(node: Element | null) => void, boolean] {
  const el = useRef<Element | null>(null);
  const ref = useCallback(
    (node: Element | null) => {
      if (!TOUCH || typeof IntersectionObserver !== 'function') return;
      if (el.current) {
        observer().unobserve(el.current);
        ids.delete(el.current);
        if (crossing.delete(id)) changed();
      }
      el.current = node;
      if (node) {
        ids.set(node, id);
        observer().observe(node);
      }
    },
    [id],
  );
  const on = useSyncExternalStore(subscribe, () => centred.has(id));
  return [ref, on];
}
