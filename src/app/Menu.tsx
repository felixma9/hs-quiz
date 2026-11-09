import type React from 'react';
import type { ReactNode } from 'react';

const art = (id: string) => `https://art.hearthstonejson.com/v1/512x/${id}.jpg`;

const MODES = [
  {
    href: '#/gauntlet',
    name: 'Gauntlet',
    blurb: 'One blank per card. Three lives. How far can you get?',
    art: 'EX1_116', // Leeroy Jenkins
  },
  {
    href: '#/quickfire',
    name: 'Quickfire',
    blurb: 'Party game: take turns with friends naming cards that fit the prompt before your fuse burns out. Or practise solo.',
    art: 'NEW1_010', // Al'Akir the Windlord
  },
  {
    href: '#/hsdle',
    name: 'HSdle',
    blurb: 'Guess the daily minion from how close each guess is.',
    art: 'EX1_298', // Ragnaros the Firelord
  },
];

/**
 * Main menu: headline, the three modes (each over a slice of classic card
 * art), then the card-pool settings (children).
 */
export function Menu({ count, banner, children }: { count: number; banner?: ReactNode; children: ReactNode }) {
  return (
    <div className="menu">
      <div className="menu-intro">
        <h1>
          How well do you know <span className="gold-text">{count.toLocaleString()}</span> Hearthstone cards?
        </h1>
      </div>
      {banner}
      <nav className="mode-list">
        {MODES.map((m) => (
          <a key={m.href} className="mode-card" href={m.href} style={{ '--art': `url(${art(m.art)})` } as React.CSSProperties}>
            <span className="mode-art" aria-hidden="true" />
            <span className="mode-body">
              <h2>{m.name}</h2>
              <p>{m.blurb}</p>
            </span>
            <span className="mode-go" aria-hidden="true">
              →
            </span>
          </a>
        ))}
      </nav>
      <section className="pool-section">
        <div className="section-label">Card pool · Gauntlet &amp; HSdle</div>
        {children}
      </section>
    </div>
  );
}
