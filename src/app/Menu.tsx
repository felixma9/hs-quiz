import type React from 'react';
import type { ReactNode } from 'react';
import { ICON, rarityIcon } from './icons';

const art = (id: string) => `https://art.hearthstonejson.com/v1/512x/${id}.jpg`;

const MODES = [
  {
    href: '#/gauntlet',
    name: 'Gauntlet',
    blurb: 'Fill in the missing part of each card. Three lives.',
    art: 'EX1_116', // Leeroy Jenkins
    icon: ICON.health,
  },
  {
    href: '#/pvp',
    name: 'Gauntlet PvP',
    blurb: 'Gauntlet with friends: take turns against the rope, steal what they miss.',
    art: 'NEW1_010', // Al'Akir the Windlord
    icon: ICON.attack,
  },
  {
    href: '#/hsdle',
    name: 'HSdle',
    blurb: 'Guess the daily card. Standard or Classic.',
    art: 'EX1_298', // Ragnaros the Firelord
    icon: rarityIcon('LEGENDARY'),
  },
  {
    href: '#/carddb',
    name: 'CardDB',
    blurb: 'Fill in what you remember to find any card.',
    art: 'EX1_559', // Archmage Antonidas
    icon: ICON.mana,
  },
];

/**
 * Main menu: headline, the modes (each over a slice of classic card
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
              <h2>
                <img className="mode-icon" src={m.icon} alt="" draggable={false} />
                {m.name}
              </h2>
              <p>{m.blurb}</p>
            </span>
            <span className="mode-go" aria-hidden="true">
              →
            </span>
          </a>
        ))}
      </nav>
      <section className="pool-section">
        <div className="section-label">Card pool · Gauntlet &amp; HSdle Unlimited</div>
        {children}
      </section>
    </div>
  );
}
