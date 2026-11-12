import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../../lib/types';
import { normalizeCardName, normalizeName } from '../../lib/fuzzy';
import { rank } from '../../lib/search';
import { Art, useArtCrop } from './Art';
import { useTapPick } from '../../card/tap';

/**
 * Type-ahead search over card names (cards of the answer's type); Enter or tap
 * picks one. `art`: show each suggestion's art (off once the mystery art is on
 * the card, or you could just match the picture).
 */
export function Search({ cards, what, exclude, art = true, onPick }: { cards: Card[]; what: string; exclude: string[]; art?: boolean; onPick(c: Card): void }) {
  const crop = useArtCrop();
  const [q, setQ] = useState('');
  const tap = useTapPick();
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const n = normalizeName(q);
    if (!n) return [];
    const ex = new Set(exclude);
    const pool = cards.filter((c) => !ex.has(c.id));
    return rank(pool, n, (c) => normalizeCardName(c.name), 8);
  }, [q, cards, exclude]);
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
        placeholder={`Type a ${what} name…`}
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
        <ul className="search-list" {...tap.list}>
          {matches.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={i === hi ? 'hi' : ''}
                onMouseEnter={() => setHi(i)}
                {...tap.option(() => pick(c))}
              >
                {art && <Art card={c} crop={crop} className="thumb" />}
                <span>{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
