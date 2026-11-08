import { useMemo } from 'react';
import type { Card } from '../lib/types';
import { normalizeName } from '../lib/fuzzy';
import { boxStyle, type Box } from './layout';

/** Typing a card name over the name banner, with suggestions from the pool. */
export function NameEditor({
  box,
  value,
  onChange,
  onDone,
  pool,
}: {
  box: Box;
  value: string;
  onChange(v: string): void;
  onDone(submit: boolean): void;
  pool: Card[];
}) {
  const names = useMemo(() => [...new Set(pool.map((c) => c.name))].sort(), [pool]);
  const matches = useMemo(() => {
    const n = normalizeName(value);
    if (n.length < 2) return [];
    const starts = names.filter((x) => normalizeName(x).startsWith(n));
    const inside = names.filter((x) => !normalizeName(x).startsWith(n) && normalizeName(x).includes(n));
    return [...starts, ...inside].slice(0, 6);
  }, [value, names]);
  const exact = matches.length === 1 && normalizeName(matches[0]) === normalizeName(value);

  return (
    <div className="card-edit-name" style={boxStyle(box)}>
      <input
        className="card-edit"
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Card name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTimeout(() => onDone(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onDone(true);
          }
        }}
      />
      {matches.length > 0 && !exact && (
        <ul className="suggest">
          {matches.map((m) => (
            <li key={m}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(m);
                  onDone(false);
                }}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
