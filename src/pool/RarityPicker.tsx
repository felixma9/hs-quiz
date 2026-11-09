import { rarityIcon } from '../app/icons';
import type { Card } from '../lib/types';

export const RARITIES = [
  { value: 'FREE', label: 'Free', color: '#9a9a9a' },
  { value: 'COMMON', label: 'Common', color: '#e8e8e8' },
  { value: 'RARE', label: 'Rare', color: '#3a7cf0' },
  { value: 'EPIC', label: 'Epic', color: '#a640d8' },
  { value: 'LEGENDARY', label: 'Legendary', color: '#f29f1c' },
];

interface Props {
  /** Cards after the set filter, for the counts. */
  cards: Card[];
  excluded: string[];
  onChange(excluded: string[]): void;
}

/** Toggle which rarities cards come from. At least one stays on. */
export function RarityPicker({ cards, excluded, onChange }: Props) {
  const ex = new Set(excluded);
  const count = (r: string) => cards.filter((c) => c.rarity === r).length;
  const toggle = (r: string) => {
    const next = new Set(ex);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    if (next.size >= RARITIES.length) return;
    onChange([...next]);
  };
  return (
    <div className="rarity-picker">
      <span className="label">Rarities</span>
      <div className="rarity-chips">
        {RARITIES.map((r) => (
          <button
            key={r.value}
            type="button"
            className={`rarity-chip ${ex.has(r.value) ? '' : 'on'}`}
            aria-pressed={!ex.has(r.value)}
            onClick={() => toggle(r.value)}
          >
            <img className={`rarity-chip-gem ${r.value === 'FREE' ? 'free' : ''}`} src={rarityIcon(r.value)} alt="" draggable={false} />
            {r.label}
            <span className="count">{count(r.value)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
