import { useRef } from 'react';

/**
 * Pick from a suggestion list on phones with the keyboard up. A plain click can
 * lose the race with the text box closing (it closes when it loses focus), so
 * a tap picks as the finger lifts, and `pressing` tells the box to stay open
 * meanwhile. Moving more than a few pixels counts as a scroll, not a pick.
 */
export function useTapPick() {
  const pressing = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  /** When the finger last picked, so the click that follows doesn't pick again. */
  const pickedAt = useRef(-Infinity);
  const list = {
    onPointerDown: (e: React.PointerEvent) => {
      pressing.current = true;
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerCancel: () => {
      pressing.current = false;
      start.current = null;
    },
  };
  /** Handlers for one option. `pick` may be called by the finger lifting or by the click after it; it runs once. */
  const option = (pick: () => void) => ({
    // Keep the text box focused (and the keyboard up) when the option is pressed.
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      pressing.current = false;
      start.current = null;
      if (e.pointerType === 'mouse' || !s || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) return;
      pickedAt.current = performance.now();
      pick();
    },
    onClick: () => {
      if (performance.now() - pickedAt.current < 700) return;
      pick();
    },
  });
  return { pressing, list, option };
}
