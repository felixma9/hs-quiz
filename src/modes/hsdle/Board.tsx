import { classIcon } from '../../app/icons';
import type React from 'react';
import { useState } from 'react';
import type { Card } from '../../lib/types';
import { COLUMNS, compare, type Tile } from './compare';
import { Art, useArtCrop } from './Art';

/** Stat columns are drawn on the same gem icons the cards use. */
const GEM: Partial<Record<string, string>> = {
  cost: 'cost-mana',
  attack: 'attack-minion',
  health: 'health',
};
const gemUrl = (key: string) => `${import.meta.env.BASE_URL}sunwell/${GEM[key]}.webp`;

/** Rarity is shown with the card's own rarity gem (Free cards have none in game: a faded Common gem). */
const RARITY_GEM: Record<string, string> = { Free: 'rarity-common', Common: 'rarity-common', Rare: 'rarity-rare', Epic: 'rarity-epic', Legendary: 'rarity-legendary' };
const asset = (name: string) => `${import.meta.env.BASE_URL}sunwell/${name}.webp`;
/** Column headers with an icon instead of (on phones) a text label. */
const HEAD_ICON: Partial<Record<string, string>> = { ...GEM, rarity: 'rarity-legendary' };
const RARITY_SHORT: Record<string, string> = { Free: 'Free', Common: 'Com.', Rare: 'Rare', Epic: 'Epic', Legendary: 'Leg.' };


export function Board({ guesses, answer }: { guesses: Card[]; answer: Card }) {
  const crop = useArtCrop();
  // Newest guess first, like the original game.
  const rows = [...guesses].reverse();
  // Tapping a tile shows its full value (tiles are small on phones).
  const [detail, setDetail] = useState<{ id: string; col: string } | null>(null);
  const detailCard = detail && guesses.find((g) => g.id === detail.id);
  const detailText = (() => {
    if (!detail || !detailCard) return null;
    if (detail.col === 'name') return detailCard.name;
    const col = COLUMNS.find((c) => c.key === detail.col)!;
    return `${detailCard.name} · ${col.label}: ${compare(detailCard, answer)[col.key].label}`;
  })();
  const tap = (id: string, col: string) => setDetail((d) => (d && d.id === id && d.col === col ? null : { id, col }));

  return (
    <div className="board-wrap">
      <div className="board" role="table">
        <div className="board-row board-head" role="row">
          <div className="board-cell name-cell" role="columnheader">
            <span className="head-label">Minion</span>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.key} className={`board-cell ${HEAD_ICON[c.key] ? 'gem-head' : ''}`} role="columnheader" title={c.label}>
              {HEAD_ICON[c.key] && <img className="head-gem" src={asset(HEAD_ICON[c.key]!)} alt={c.label} />}
              <span className="head-label">{c.label}</span>
            </div>
          ))}
        </div>
        {rows.map((g, r) => {
          const t = compare(g, answer);
          const on = (col: string) => detail?.id === g.id && detail.col === col;
          return (
            <div key={g.id} className={`board-row ${r === 0 ? 'newest' : ''}`} role="row">
              <button type="button" className={`board-cell name-cell ${on('name') ? 'selected' : ''}`} role="cell" title={g.name} onClick={() => tap(g.id, 'name')}>
                <Art card={g} crop={crop} className="thumb" zoom />
                <span className="name-text">{g.name}</span>
              </button>
              {COLUMNS.map((c, i) => (
                <TileCell
                  key={c.key}
                  col={c.key}
                  tile={t[c.key]}
                  delay={r === 0 ? i * 120 : 0}
                  selected={on(c.key)}
                  onTap={() => tap(g.id, c.key)}
                />
              ))}
            </div>
          );
        })}
      </div>
      {detailText && <div className="board-detail">{detailText}</div>}
    </div>
  );
}

function TileCell({ col, tile, delay, selected, onTap }: { col: string; tile: Tile; delay: number; selected: boolean; onTap(): void }) {
  const arrowLabel = tile.arrow === 'up' ? 'higher' : 'lower';
  if (GEM[col]) {
    return (
      <div className={`board-cell tile stat-tile t-${tile.verdict} ${selected ? 'selected' : ''}`} style={{ '--d': `${delay}ms` } as React.CSSProperties} role="cell" onClick={onTap}>
        <span className={`stat-gem gem-${col}`}>
          <img src={gemUrl(col)} alt="" />
          <span className="stat-num">{tile.label}</span>
        </span>
        {tile.arrow && (
          <span className="arrow-badge" aria-label={arrowLabel}>
            {tile.arrow === 'up' ? '▲' : '▼'}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className={`board-cell tile t-${tile.verdict} ${selected ? 'selected' : ''}`} style={{ '--d': `${delay}ms` } as React.CSSProperties} role="cell" onClick={onTap}>
      {tile.arrow && <span className={`tile-arrow ${tile.arrow}`} aria-label={arrowLabel} />}
      {col === 'rarity' ? (
        <span className="tile-label rarity-label">
          <img
            className={`rarity-gem ${tile.label === 'Free' ? 'free' : ''}`}
            src={asset(RARITY_GEM[tile.label] ?? 'rarity-common')}
            alt=""
          />
          <span className="full">{tile.label}</span>
          <span className="short">{RARITY_SHORT[tile.label] ?? tile.label}</span>
        </span>
      ) : col === 'class' ? (
        <span className="tile-label rarity-label class-label">
          {/* One icon per class: multiclass labels are "Mage, Priest, Warlock". */}
          <span className="class-tile-icons">
            {tile.label.split(', ').map((c) => (
              <img key={c} className="class-tile-icon" src={classIcon(c.toUpperCase().replace(/ /g, ''))} alt="" />
            ))}
          </span>
          <span>{tile.label}</span>
        </span>
      ) : (
        <span className="tile-label">{tile.label}</span>
      )}
    </div>
  );
}
