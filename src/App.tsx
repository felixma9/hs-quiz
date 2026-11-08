import { useEffect, useMemo, useState } from 'react';
import type { Card } from './lib/types';
import { loadCards } from './lib/cards';
import { drawable, filterPool, loadExcluded, saveExcluded } from './lib/pool';
import { Gauntlet } from './modes/Gauntlet';
import { Cardle } from './modes/Cardle';
import { SetPicker } from './components/SetPicker';
import { GameCard } from './components/GameCard';

type Route = 'menu' | 'gauntlet' | 'cardle' | 'card';
const parse = (): Route => {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('card/')) return 'card';
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
    <>
      <header className="top">
        <div className="top-inner">
          {route !== 'menu' ? (
            <a href="#/" className="top-back" aria-label="Back to menu">
              ←
            </a>
          ) : (
            <span />
          )}
          <a href="#/" className="top-title">
            {route === 'gauntlet' ? 'Gauntlet' : route === 'cardle' ? 'Cardle' : 'HS Quiz'}
          </a>
          <span />
        </div>
      </header>
      <div className="app">
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
        {cards && route === 'card' && <CardPreview cards={cards} />}
      </main>
      <footer className="muted small">
        Card data from <a href="https://hearthstonejson.com">HearthstoneJSON</a>. Hearthstone is © Blizzard Entertainment; this is an
        unofficial fan quiz.
      </footer>
      </div>
    </>
  );
}

function Menu({ count, children }: { count: number; children: React.ReactNode }) {
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
      <a className="mode-card" href="#/cardle">
        <h2>Cardle</h2>
        <p>A new card every day. Fill in the blank card in 6 tries.</p>
      </a>
    </div>
  );
}

/** #/card/<id>: one card, fully revealed. Handy for checking how a card draws. */
function CardPreview({ cards }: { cards: Card[] }) {
  const id = decodeURIComponent(location.hash.replace(/^#\/?card\//, ''));
  const card = cards.find((c) => c.id === id);
  if (!card) return <div className="panel center muted">No card with id {id}.</div>;
  return <GameCard card={card} hidden={new Set()} pool={cards} />;
}
