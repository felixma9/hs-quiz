import { useLayoutEffect, useRef } from 'react';

/**
 * A sliding highlight for a row of options (tabs, segmented controls): put the
 * returned ref on the container. The highlight (the container's ::before,
 * styled in motion.css) sits behind whichever child has the class "on" and
 * slides to the new one when the choice changes. The first placement, and
 * resizes, don't animate.
 */
export function usePill<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const placed = useRef(false);
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const on = el.querySelector<HTMLElement>(':scope > .on');
    el.classList.toggle('has-pill', !!on);
    if (!on) return;
    el.style.setProperty('--pill-x', `${on.offsetLeft}px`);
    el.style.setProperty('--pill-y', `${on.offsetTop}px`);
    el.style.setProperty('--pill-w', `${on.offsetWidth}px`);
    el.style.setProperty('--pill-h', `${on.offsetHeight}px`);
  };
  // After every render: the chosen option may have changed.
  useLayoutEffect(() => {
    place();
    if (!placed.current) {
      placed.current = true;
      // Slide only from the second placement on.
      const r = requestAnimationFrame(() => ref.current?.classList.add('pill-slides'));
      return () => cancelAnimationFrame(r);
    }
  });
  // Sizes change (fonts loading, rotation): move without sliding.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      el.classList.remove('pill-slides');
      place();
      requestAnimationFrame(() => el.classList.add('pill-slides'));
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}
