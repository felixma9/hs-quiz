import { useEffect, useMemo, useState } from 'react';
import type { Card } from './lib/types';
import { loadCards } from './lib/cards';
import { drawable, filterPool, loadExcluded, saveExcluded } from './lib/pool';
import { Gauntlet } from './modes/Gauntlet';
import { Cardle } from './modes/Cardle';
import { SetPicker } from './components/SetPicker';

type Route = 'menu' | 'gauntlet' | 'cardle';
const parse = (): Route => {
  const h = location.hash.replace(/^#\/?/, '');
  return h === 'gauntlet' || h === 'cardle' ? h : 'menu';
};

export function App() {
  const [route, setRoute] = useState<Route>(parse);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<string[]>(loadExcluded);
  const pool = useMemo(() => (cards ? filterPool(cards, excluded) : []), [cards, excluded]);
  const updateExcluded = (ex: string[]) => {
    setExcluded(ex);
    saveExcluded(ex);
  };

  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    loadCards().then((c) => setCards(drawable(c)), (e) => setError(String(e)));
  }, []);

  return (
    <div className="app">
      <header className="top">
        <a href="#/" className="logo">
          HS Quiz
        </a>
        {route !== 'menu' && <span className="muted">{route === 'gauntlet' ? 'Gauntlet' : 'Cardle'}</span>}
      </header>
      <main>
        {error && <div className="panel feedback bad">{error}</div>}
        {!cards && !error && <div className="panel center muted">Loading cards…</div>}
        {cards && route === 'menu' && (
          <Menu count={pool.length}>
            <SetPicker cards={cards} excluded={excluded} onChange={updateExcluded} />
          </Menu>
        )}
        {cards && route !== 'menu' && pool.length === 0 && (
          <div className="panel center">
            No card sets selected. <a href="#/">Pick some on the menu.</a>
          </div>
        )}
        {cards && pool.length > 0 && route === 'gauntlet' && <Gauntlet cards={pool} />}
        {cards && pool.length > 0 && route === 'cardle' && <Cardle cards={pool} />}
      </main>
      <footer className="muted small">
        Card data from <a href="https://hearthstonejson.com">HearthstoneJSON</a>. Hearthstone is © Blizzard Entertainment; this is an
        unofficial fan quiz.
      </footer>
    </div>
  );
}

function Menu({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <div className="menu">
      <p className="muted">How well do you know {count.toLocaleString()} Hearthstone cards?</p>
      {children}
      <a className="mode-card" href="#/gauntlet">
        <h2>Gauntlet</h2>
        <p>One attribute is hidden on each card. Fill it in. Three lives, so see how far you get.</p>
      </a>
      <a className="mode-card" href="#/cardle">
        <h2>Cardle</h2>
        <p>Daily puzzle: you get the art and the card frame. Fill in everything else in 6 tries, with clues after each guess.</p>
      </a>
    </div>
  );
}
