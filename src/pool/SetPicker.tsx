import { useMemo, useState } from 'react';
import type { Card } from '../lib/types';
import { CLASSIC_AGE, SETS, STANDARD_SETS, setName } from '../data/sets';

interface Props {
  cards: Card[];
  excluded: string[];
  onChange(excluded: string[]): void;
}

const ORDER = Object.keys(SETS);
const order = (s: string) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length);

export function SetPicker({ cards, excluded, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ex = new Set(excluded);

  const years = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) counts.set(c.set, (counts.get(c.set) ?? 0) + 1);
    const byYear = new Map<number, { set: string; count: number }[]>();
    for (const [set, count] of counts) {
      const y = SETS[set]?.year ?? 0;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push({ set, count });
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      // Within a year, in release order (SETS is listed chronologically).
      .map(([year, sets]) => ({ year, sets: sets.sort((a, b) => order(a.set) - order(b.set)) }));
  }, [cards]);

  const all = years.flatMap((y) => y.sets.map((s) => s.set));
  const selectedCount = cards.filter((c) => !ex.has(c.set)).length;
  const selectedSets = all.filter((s) => !ex.has(s)).length;

  const toggle = (sets: string[], on: boolean) => {
    const next = new Set(ex);
    for (const s of sets) {
      if (on) next.delete(s);
      else next.add(s);
    }
    onChange([...next]);
  };
  const standard = new Set(STANDARD_SETS);
  const isStandard = all.every((s) => ex.has(s) !== standard.has(s));
  // Classic: every set at least CLASSIC_AGE years old (it grows by a year each January).
  const classicUpTo = new Date().getFullYear() - CLASSIC_AGE;
  const classic = new Set(years.filter((y) => y.year > 0 && y.year <= classicUpTo).flatMap((y) => y.sets.map((s) => s.set)));
  const isClassic = classic.size > 0 && all.every((s) => ex.has(s) !== classic.has(s));

  return (
    <div className="panel set-picker">
      <button className="set-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          <b>Card sets</b>{' '}
          <span className="muted">
            {selectedSets === all.length ? 'All sets' : isStandard ? 'Standard' : isClassic ? 'Classic' : `${selectedSets} of ${all.length} sets`} · {selectedCount.toLocaleString()} cards
          </span>
        </span>
        <span className={`chev ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && (
        <>
          <div className="row left">
            <button className="btn small" onClick={() => onChange([])}>
              All
            </button>
            <button className="btn small" onClick={() => onChange(all.filter((s) => !standard.has(s)))} aria-pressed={isStandard}>
              Standard
            </button>
            <button
              className="btn small"
              onClick={() => onChange(all.filter((s) => !classic.has(s)))}
              aria-pressed={isClassic}
              title={`Sets ${CLASSIC_AGE}+ years old (up to ${classicUpTo})`}
            >
              Classic
            </button>
            <button className="btn small" onClick={() => onChange(all)}>
              None
            </button>
          </div>
          {years.map(({ year, sets }) => {
            const names = sets.map((s) => s.set);
            const allOn = names.every((s) => !ex.has(s));
            return (
              <fieldset key={year} className="set-year">
                <legend>
                  <label className="check">
                    <input type="checkbox" checked={allOn} onChange={(e) => toggle(names, e.target.checked)} />
                    <b>{year || 'Other'}</b>
                  </label>
                </legend>
                {sets.map(({ set, count }) => (
                  <label key={set} className="check set-row">
                    <input type="checkbox" checked={!ex.has(set)} onChange={(e) => toggle([set], e.target.checked)} />
                    <span>{setName(set)}</span>
                    <span className="muted small">{count}</span>
                  </label>
                ))}
              </fieldset>
            );
          })}
        </>
      )}
    </div>
  );
}
