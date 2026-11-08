import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../../lib/types';
import { normalizeName } from '../../lib/fuzzy';
import { Art, useArtCrop } from './Art';

/** Type-ahead search over minion names; Enter or tap picks one. */

export function Search({ minions, exclude, onPick }: { minions: Card[]; exclude: string[]; onPick(c: Card): void }) {
  const crop = useArtCrop();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const n = normalizeName(q);
    if (!n) return [];
    const ex = new Set(exclude);
    const pool = minions.filter((c) => !ex.has(c.id));
    const starts = pool.filter((c) => normalizeName(c.name).startsWith(n));
    const inside = pool.filter((c) => !normalizeName(c.name).startsWith(n) && normalizeName(c.name).includes(n));
    return [...starts, ...inside].slice(0, 8);
  }, [q, minions, exclude]);
  useEffect(() => setHi(0), [q]);

  const pick = (c: Card) => {
    onPick(c);
    setQ('');
    input.current?.focus();
  };

  return (
    <div className="search">
      <input
        ref={input}
        className="in"
        placeholder="Type a minion name…"
        value={q}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter' && matches[hi]) {
            e.preventDefault();
            pick(matches[hi]);
          }
        }}
      />
      {matches.length > 0 && (
        <ul className="search-list">
          {matches.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={i === hi ? 'hi' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(c)}
              >
                <Art card={c} crop={crop} className="thumb" />
                <span>{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
