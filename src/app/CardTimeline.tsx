import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../lib/types';
import { drawable } from '../pool/pool';
import { GameCard } from '../card/GameCard';
import { monthYear, wordDiff, type Version } from '../lib/history';
import { Tilt } from './Tilt';

const NONE = new Set<never>();
const renderUrl = (c: Card) => `https://art.hearthstonejson.com/v1/render/latest/enUS/512x/${c.id}.png`;

/** Old text with the removed words struck out, new text with the added words marked. */
function TextChange({ from, to }: { from: string; to: string }) {
  const { removed, added } = wordDiff(from, to);
  // Runs of changed words are marked together, so a rewritten phrase reads as one change.
  const words = (ws: [string, boolean][], cls: string) => {
    if (!ws.length) return <em className="muted">No text</em>;
    const runs: [string, boolean][] = [];
    for (const [w, changed] of ws) {
      const last = runs.at(-1);
      if (last && last[1] === changed) last[0] += ` ${w}`;
      else runs.push([w, changed]);
    }
    return runs.map(([text, changed], i) => (
      <span key={i}>
        {i > 0 && ' '}
        {changed ? <span className={cls}>{text}</span> : text}
      </span>
    ));
  };
  return (
    <div className="tl-text">
      <p><span className="tl-label">Before</span> {words(removed, 'tl-del')}</p>
      <p><span className="tl-label">After</span> {words(added, 'tl-ins')}</p>
    </div>
  );
}

/** What changed in one version, and its tags: shown under the focused card. */
function VersionInfo({ v, next, isNow }: { v: Version; next?: Version; isNow: boolean }) {
  return (
    <div className="lc-info" key={v.patch ?? 'release'}>
      <div className="tl-tags">
        <span className="tl-when">{v.patch ? `Patch ${v.patch}` : 'At release'}</span>
        {v.date && <span className="tl-date">{monthYear(v.date)}</span>}
        {isNow && <span className="tl-tag now">Current</span>}
        {v.tags.map((t) => (
          <span key={t.label} className={`tl-tag ${t.tone}`}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="tl-changes">
        {v.diffs.map((d) => (
          <div key={d.key} className="tl-diff">
            <span className="tl-label">{d.label}</span> <span className="tl-old">{d.from}</span> →{' '}
            <b className={d.tone ?? ''}>{d.to}</b>
          </div>
        ))}
        {v.oldText !== undefined && <TextChange from={v.oldText} to={v.card.text ?? ''} />}
        {!v.patch && (
          <p className="muted small">
            As the card first came out{next?.date ? `, until ${monthYear(next.date)}` : ''}.
          </p>
        )}
      </div>
    </div>
  );
}

/** Before the timeline opens, the current card alone: what the zoom shows. */
const alone = (card: Card): Version => ({ card, diffs: [], tags: [] });

type Phase = 'closed' | 'opening' | 'expanding' | 'open' | 'collapsing';

/** Most a drag or scroll can pull the strip past its first or last version, in px. */
const OVERSHOOT = 60;

/** How long folding the timeline back up takes. */
const COLLAPSE_MS = 380;

/**
 * A zoomed card that opens into a carousel of every version of it. Closed, it
 * is just the card. Tapping it (when it has a history) slides the older
 * versions out from behind its left side, oldest furthest left, with a time
 * rail and the focused version's changes below. Tapping the focused card
 * again folds them back behind it. The current card is the same drawing
 * throughout, so it never redraws or moves. Drag, the arrow keys, the side
 * cards or the rail move between versions.
 */
export function CardTimeline({
  card,
  versions,
  open,
  onOpen,
  onClose,
  hint,
}: {
  card: Card;
  /** Newest first (from timeline()); null while the history is loading. */
  versions: Version[] | null;
  open: boolean;
  onOpen(): void;
  /** Called once the timeline has folded back into the single card. */
  onClose(): void;
  hint: string;
}) {
  const past = versions ? versions.length - 1 : 0;
  // Oldest on the left; the current card is always the last slide, keyed 'now' so it stays the same element.
  // The older versions are there (hidden behind the current card) as soon as the history has loaded,
  // so they draw while the card is still on its own and are ready by the time the timeline opens.
  const slides = useMemo(() => (versions ? [...versions].reverse() : [alone(card)]), [versions, card]);
  const last = slides.length - 1;
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('closed');
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; id: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const canDraw = drawable([card]).length > 0;
  const go = (i: number) => setIdx(Math.max(0, Math.min(last, i)));
  const stage = useRef<HTMLDivElement>(null);
  /** One version's width on screen, card plus gap (what a drag of one step covers). */
  const stepPx = () => {
    const slide = stage.current?.querySelector<HTMLElement>('.lc-slide');
    const gap = parseFloat(getComputedStyle(stage.current!.querySelector('.lc-track')!).columnGap) || 0;
    return (slide?.offsetWidth ?? 250) + gap;
  };
  /** Snap a drag (or a sideways scroll) of dx pixels to the nearest version. */
  const settle = (dx: number) => {
    const step = Math.round(-dx / stepPx()) || (Math.abs(dx) > 50 ? -Math.sign(dx) : 0);
    go(idx + step);
    setDrag(0);
  };
  /**
   * The strip follows a drag (or a sideways scroll) as far as the oldest and newest versions,
   * then only gives a little elastic overshoot, at most OVERSHOOT px, wherever the drag started.
   */
  const resist = (dx: number, i: number) => {
    const step = stepPx();
    const max = i * step; // dragging right shows older versions, up to the oldest
    const min = -(last - i) * step; // dragging left shows newer ones, up to the current
    const give = (over: number) => OVERSHOOT * (1 - Math.exp(-over / (OVERSHOOT * 2)));
    if (dx > max) return max + give(dx - max);
    if (dx < min) return min - give(min - dx);
    return dx;
  };

  // Sideways scrolling (two-finger swipe on a trackpad, Shift + wheel) moves the strip like a drag,
  // then snaps once it stops. A native listener, so it can stop the browser's swipe-back gesture.
  const wheel = useRef({ dx: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 });
  const settleRef = useRef(settle);
  settleRef.current = settle;
  const resistRef = useRef(resist);
  resistRef.current = resist;
  const idxRef = useRef(idx);
  idxRef.current = idx;
  useEffect(() => {
    const el = stage.current;
    if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      if (Math.abs(dx) <= Math.abs(e.shiftKey ? 0 : e.deltaY)) return; // mostly vertical: let the page scroll
      e.preventDefault();
      const w = wheel.current;
      w.dx -= dx * (e.deltaMode === 1 ? 16 : 1);
      // The strip shows the scroll held to the ends (a long swipe or trackpad momentum can't pull it
      // into empty space); the snap uses the whole scroll, and can't land past the ends either.
      setDrag(resistRef.current(w.dx, idxRef.current));
      if (w.timer) clearTimeout(w.timer);
      w.timer = setTimeout(() => {
        const moved = w.dx;
        w.dx = 0;
        w.timer = 0;
        settleRef.current(moved);
      }, 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheel.current.timer) clearTimeout(wheel.current.timer);
    };
  }, [open]);
  const collapsing = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(collapsing.current), []);
  /** Fold the older versions back behind the current card, then close. */
  const collapse = () => {
    if (phase === 'collapsing') return;
    setIdx(last);
    setPhase('collapsing');
    collapsing.current = setTimeout(onClose, COLLAPSE_MS);
  };

  // Opening: the older cards appear stacked behind the current one (no transition),
  // then slide out to their places, nearest first.
  useLayoutEffect(() => {
    if (!open) {
      setPhase('closed');
      setIdx(last);
      return;
    }
    setIdx(last);
    setPhase('opening');
    let t = 0;
    const r = requestAnimationFrame(() => {
      t = requestAnimationFrame(() => setPhase('expanding'));
    });
    const done = setTimeout(() => setPhase('open'), 450 + last * 70 + 100);
    return () => {
      cancelAnimationFrame(r);
      cancelAnimationFrame(t);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, last]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(idx - 1);
      if (e.key === 'ArrowRight') go(idx + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The current card draws first; the older versions wait for it (a same-size blank until then), so
  // opening a card is never slowed by its history. Sunwell draws one card at a time, in the order asked.
  const [mainDrawn, setMainDrawn] = useState(!canDraw);
  useEffect(() => setMainDrawn(!canDraw), [card.id, canDraw]);
  const face = (v: Version, now: boolean) =>
    !canDraw ? (
      <img className="zoom-render" src={renderUrl(v.card)} alt={v.card.name} />
    ) : now || mainDrawn ? (
      <GameCard card={v.card} hidden={NONE} pool={[]} onDrawn={now ? () => setMainDrawn(true) : undefined} />
    ) : (
      <div className="lc-waiting" aria-hidden="true" />
    );

  return (
    <div className={`lc ${open ? 'is-open' : ''} ${phase === 'collapsing' ? 'collapsing' : ''} ${past ? '' : 'no-history'}`}>
      {open && versions && (
        <header className="tl-head" onClick={(e) => e.stopPropagation()}>
          <h2>{card.name}</h2>
          <span className="muted small">
            {past} change{past === 1 ? '' : 's'} since release
          </span>
        </header>
      )}
      <div
        ref={stage}
        className={`lc-stage ${drag ? 'dragging' : ''}`}
        onPointerDown={(e) => {
          if (!open) return;
          start.current = { x: e.clientX, id: e.pointerId, moved: false };
          dragged.current = false;
        }}
        onPointerMove={(e) => {
          const st = start.current;
          if (!st || st.id !== e.pointerId) return;
          const dx = e.clientX - st.x;
          if (!st.moved && Math.abs(dx) < 8) return;
          st.moved = true;
          dragged.current = true;
          setDrag(resist(dx, idx));
        }}
        onPointerUp={() => {
          const st = start.current;
          start.current = null;
          if (!st?.moved) return;
          // Half a card's width moves one version (any clear swipe moves at least one); a long fling moves more.
          settle(drag);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(0);
        }}
        onClickCapture={(e) => {
          // The click that ends a drag isn't a tap on a card.
          if (dragged.current) {
            e.stopPropagation();
            dragged.current = false;
          }
        }}
      >
        <div className={`lc-track ${phase}`} style={{ '--i': idx, '--drag': `${drag}px` } as React.CSSProperties}>
          {slides.map((v, i) => {
            const focus = i === idx;
            const now = i === last;
            return (
              <div
                key={now ? 'now' : `v${i}`}
                className={`lc-slide ${focus ? 'focus' : ''} ${now ? 'now' : ''}`}
                style={{ '--back': last - i } as React.CSSProperties}
                aria-current={focus || undefined}
                onClick={(e) => {
                  // Closed: the card opens its history; with none, a tap on it does nothing.
                  if (!open) {
                    e.stopPropagation();
                    if (past) onOpen();
                    return;
                  }
                  e.stopPropagation();
                  // The focused card toggles the timeline back closed; a side card comes into focus.
                  if (focus) collapse();
                  else go(i);
                }}
              >
                {/* When this version came in: the release date for the first, then each change's. */}
                <div className="lc-when" aria-hidden={!open}>
                  <b>{v.date ? monthYear(v.date) : ' '}</b>
                  <span>{v.patch ? `Patch ${v.patch}` : 'Released'}</span>
                </div>
                {/* The card in focus tilts toward the pointer; the others stay flat. */}
                <Tilt active={focus}>{face(v, now)}</Tilt>
              </div>
            );
          })}
        </div>
        {open && idx > 0 && (
          <button type="button" className="lc-nav prev" aria-label="Older version" onClick={(e) => (e.stopPropagation(), go(idx - 1))}>
            ‹
          </button>
        )}
        {open && idx < last && (
          <button type="button" className="lc-nav next" aria-label="Newer version" onClick={(e) => (e.stopPropagation(), go(idx + 1))}>
            ›
          </button>
        )}
      </div>

      {open ? (
        <>
          {/* The time rail: one stop per version, oldest first. */}
          <ol className="lc-rail" onClick={(e) => e.stopPropagation()}>
            {slides.map((v, i) => (
              <li key={i} className={`${i === idx ? 'on' : ''} ${v.tags.find((t) => t.tone !== 'other')?.tone ?? ''}`}>
                <button type="button" onClick={() => go(i)} aria-label={v.patch ? `Patch ${v.patch}` : 'At release'} title={v.patch ? `Patch ${v.patch}` : 'At release'}>
                  <span className="lc-dot" />
                  <span className="lc-year">{v.date ? v.date.slice(0, 4) : i === 0 ? 'Release' : ''}</span>
                </button>
              </li>
            ))}
          </ol>
          <div onClick={(e) => e.stopPropagation()}>
            <VersionInfo v={slides[idx]} next={slides[idx + 1]} isNow={idx === last} />
          </div>
        </>
      ) : (
        <span className={`zoom-hint ${past ? 'has-history' : ''}`}>{hint}</span>
      )}
    </div>
  );
}
