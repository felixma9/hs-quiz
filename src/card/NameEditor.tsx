import { useMemo } from 'react';
import type { Card } from '../lib/types';
import { normalizeName } from '../lib/fuzzy';
import { boxStyle, type Box } from './layout';
import { useTapPick } from './tap';

/** Touch screens: the keyboard covers whatever is below the field, so suggestions open above it. */
const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

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
  const tap = useTapPick();
  const pick = (m: string) => {
    onChange(m);
    onDone(false);
  };

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
        // Close a moment after losing focus, unless a finger is on a suggestion.
        onBlur={() => setTimeout(() => !tap.pressing.current && onDone(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onDone(true);
          }
        }}
      />
      {matches.length > 0 && !exact && (
        <ul className={`suggest ${touch ? 'up' : ''}`} {...tap.list}>
          {matches.map((m) => (
            <li key={m}>
              <button type="button" {...tap.option(() => pick(m))}>
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
