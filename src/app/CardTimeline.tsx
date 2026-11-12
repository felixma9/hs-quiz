import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../lib/types';
import { drawable } from '../pool/pool';
import { GameCard } from '../card/GameCard';
import { monthYear, wordDiff, type Version } from '../lib/history';
import { Lenticular } from './Lenticular';

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

/**
 * Every version of a card on a carousel, oldest on the left, opening on the
 * current one. The focused card is a lenticular print of itself and the
 * version before it: move the pointer across it (or press and hold) to see
 * what it was. Drag, the arrow keys, the side cards or the time rail move
 * between versions.
 */
export function CardTimeline({ versions }: { versions: Version[] }) {
  // versions is newest first; the carousel reads left to right through time.
  const slides = useMemo(() => [...versions].reverse(), [versions]);
  const last = slides.length - 1;
  const [idx, setIdx] = useState(last);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; id: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const canDraw = drawable([versions[0].card]).length > 0;
  const go = (i: number) => setIdx(Math.max(0, Math.min(last, i)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(idx - 1);
      if (e.key === 'ArrowRight') go(idx + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const face = (v: Version) =>
    canDraw ? <GameCard card={v.card} hidden={NONE} pool={[]} /> : <img className="zoom-render" src={renderUrl(v.card)} alt={v.card.name} />;

  return (
    <div className="lc">
      <div
        className={`lc-stage ${drag ? 'dragging' : ''}`}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, id: e.pointerId, moved: false };
          dragged.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const dx = e.clientX - s.x;
          if (!s.moved && Math.abs(dx) < 8) return;
          s.moved = true;
          dragged.current = true;
          setDrag(dx);
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          if (!s?.moved) return;
          // A drag of about a third of a card moves one version; a long fling moves more.
          const step = Math.round(-drag / 180) || (Math.abs(drag) > 50 ? -Math.sign(drag) : 0);
          go(idx + step);
          setDrag(0);
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
        <div className="lc-track" style={{ '--i': idx, '--drag': `${drag}px` } as React.CSSProperties}>
          {slides.map((v, i) => {
            const focus = i === idx;
            const before = slides[i - 1];
            return (
              <div
                key={i}
                className={`lc-slide ${focus ? 'focus' : ''}`}
                aria-current={focus || undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!focus) go(i);
                }}
              >
                {canDraw ? (
                  <Lenticular
                    active={focus}
                    front={face(v)}
                    back={before && face(before)}
                    backLabel={before && v.patch ? `Before patch ${v.patch}` : undefined}
                  />
                ) : (
                  face(v)
                )}
              </div>
            );
          })}
        </div>
        {idx > 0 && (
          <button type="button" className="lc-nav prev" aria-label="Older version" onClick={(e) => (e.stopPropagation(), go(idx - 1))}>
            ‹
          </button>
        )}
        {idx < last && (
          <button type="button" className="lc-nav next" aria-label="Newer version" onClick={(e) => (e.stopPropagation(), go(idx + 1))}>
            ›
          </button>
        )}
      </div>

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
      {canDraw && idx > 0 && <p className="lc-hint muted small">Move across the card, or press and hold it, to see it before this patch.</p>}
    </div>
  );
}
