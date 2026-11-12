import { useEffect, useRef } from 'react';

/**
 * Enter anywhere on the page submits, while `active`. Presses inside a field or
 * on a button are left to that control (fields submit themselves; a focused
 * button is pressed by Enter).
 */
export function useEnter(active: boolean, submit: () => void) {
  const fn = useRef(submit);
  fn.current = submit;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|BUTTON|SELECT|A|SUMMARY)$/.test(t.tagName)) return;
      e.preventDefault();
      fn.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
