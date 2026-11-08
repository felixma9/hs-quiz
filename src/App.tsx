import { useEffect, useMemo, useState } from 'react';
import type { Card } from './lib/types';
import { loadCards } from './lib/cards';
import { drawable, filterPool, loadExcluded, loadExcludedRarities, saveExcluded, saveExcludedRarities } from './lib/pool';
import { RarityPicker } from './components/RarityPicker';
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
  const decor = useDecor();
  const [excludedRarities, setExcludedRarities] = useState<string[]>(loadExcludedRarities);
  const setPool = useMemo(() => (cards ? filterPool(cards, excluded) : []), [cards, excluded]);
  const pool = useMemo(() => (cards ? filterPool(cards, excluded, excludedRarities) : []), [cards, excluded, excludedRarities]);
  const updateRarities = (r: string[]) => {
    setExcludedRarities(r);
    saveExcludedRarities(r);
  };
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
            {decor.logo ? <img className="decor-logo" src={decor.logo} alt="" /> : <ManaMark />}
            {route === 'gauntlet' ? 'Gauntlet' : route === 'cardle' ? 'Cardle' : 'HS Quiz'}
          </a>
          <span />
        </div>
      </header>
      <div className={`app app-${route}`}>
      <main>
        {error && <div className="panel feedback bad">{error}</div>}
        {!cards && !error && <div className="panel center muted">Loading cards…</div>}
        {cards && route === 'menu' && (
          <Menu count={pool.length}>
            <RarityPicker cards={setPool} excluded={excludedRarities} onChange={updateRarities} />
            <SetPicker cards={cards} excluded={excluded} onChange={updateExcluded} />
          </Menu>
        )}
        {cards && route !== 'menu' && pool.length === 0 && (
          <div className="panel center">
            No cards match your sets and rarities. <a href="#/">Change them on the menu.</a>
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
        <p>Guess the daily minion. Every guess shows how close its mana, stats, keywords, set, rarity, tribe and class are.</p>
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

/** A small mana-crystal mark (original drawing) for the title bar. */
function ManaMark() {
  return (
    <svg className="mark" viewBox="0 0 22 26" aria-hidden="true">
      <defs>
        <linearGradient id="mana" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fd0ff" />
          <stop offset="1" stopColor="#1f5fbf" />
        </linearGradient>
      </defs>
      <path d="M11 1 L21 7 L21 19 L11 25 L1 19 L1 7 Z" fill="url(#mana)" stroke="#e8c26a" strokeWidth="1.5" />
      <path d="M11 1 L11 25 M1 7 L21 19 M21 7 L1 19" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
    </svg>
  );
}

/**
 * Optional decor images the owner can drop into public/decor/ (logo.png,
 * background.jpg). Nothing ships there by default; if the files are missing,
 * the site uses its own original mark and plain background.
 */
function useDecor() {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    const base = `${import.meta.env.BASE_URL}decor/`;
    const probe = (file: string, ok: (url: string) => void) => {
      const img = new Image();
      img.onload = () => ok(img.src);
      img.src = base + file;
    };
    probe('logo.png', setLogo);
    probe('background.jpg', (url) => {
      document.body.style.setProperty('--decor-bg', `url("${url}")`);
      document.body.classList.add('has-decor-bg');
    });
  }, []);
  return { logo };
}
