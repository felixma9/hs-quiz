import type { ReactNode } from 'react';

/** Main menu: intro line, the card-pool pickers (children) and the mode links. */
export function Menu({ count, children }: { count: number; children: ReactNode }) {
  return (
    <div className="menu">
      <div className="menu-intro">
        <p>How well do you know {count.toLocaleString()} Hearthstone cards?</p>
      </div>
      {children}
      <a className="mode-card" href="#/gauntlet">
        <h2>Gauntlet</h2>
        <p>One blank per card. Three lives. How far can you get?</p>
      </a>
      <a className="mode-card" href="#/quickfire">
        <h2>Quickfire</h2>
        <p>60 seconds. "Name a minion with 4 Attack", "Finish the name: Chi…". How many can you name?</p>
      </a>
      <a className="mode-card" href="#/hsdle">
        <h2>HSdle</h2>
        <p>Guess the daily minion. Every guess shows how close its mana, stats, keywords, set, rarity, tribe and class are.</p>
      </a>
    </div>
  );
}
