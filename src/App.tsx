import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Card } from './lib/types';
import { loadCards } from './lib/cards';
import { drawable, filterPool } from './pool/pool';
import { usePool } from './pool/usePool';
import { RarityPicker } from './pool/RarityPicker';
import { SetPicker } from './pool/SetPicker';
import { SharePanel, SharedBanner } from './pool/SharePanel';
import { codeFromLocation, decodeSetup, type SharedSetup } from './pool/shareCode';
import { saveSettings } from './modes/gauntlet/settings';
import { parseRoute, type Route } from './app/routes';
import { confirmLeave, isGuarded } from './app/leaveGuard';
import { TitleBar } from './app/TitleBar';
import { Menu } from './app/Menu';
import { CardPreview } from './app/CardPreview';
import { CardZoomHost } from './app/CardZoom';
import { Gauntlet } from './modes/gauntlet/Gauntlet';
import { Hsdle } from './modes/hsdle/Hsdle';
import { Pvp } from './modes/pvp/Pvp';
import { CardDb } from './modes/carddb/CardDb';

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  const [cards, setCards] = useState<Card[] | null>(null);
  /** Every collectible card, including types the card renderer can't draw (CardDB and card lookups use these). */
  const [everything, setEverything] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { pool, setPool, excludedSets, excludedRarities, updateSets, updateRarities } = usePool(cards);
  // Settings from a share link (#/?s=CODE), waiting for the player to accept.
  const [incoming, setIncoming] = useState<SharedSetup | null>(() => decodeSetup(codeFromLocation() ?? ''));

  const applySetup = (s: SharedSetup) => {
    saveSettings(s.gauntlet);
    updateSets(s.excludedSets);
    updateRarities(s.excludedRarities);
  };
  const closeIncoming = () => {
    setIncoming(null);
    history.replaceState(null, '', '#/');
  };

  useEffect(() => {
    // The page we're on, to go back to if the player cancels leaving a room.
    let here = location.hash;
    const on = () => {
      if (isGuarded() && parseRoute() !== parseRoute(here)) {
        if (!confirmLeave()) {
          // Stay: put the room's address back without another hashchange.
          history.replaceState(null, '', here);
          return;
        }
      }
      here = location.hash;
      // Cross-fade between pages where the browser supports view transitions.
      const go = () => flushSync(() => setRoute(parseRoute()));
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const doc = document as Document & { startViewTransition?(cb: () => void): unknown };
      if (doc.startViewTransition && !calm) doc.startViewTransition(go);
      else go();
      const s = decodeSetup(codeFromLocation() ?? '');
      if (s) setIncoming(s);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    loadCards().then(
      (c) => {
        setEverything(c);
        setCards(drawable(c));
      },
      (e) => setError(String(e)),
    );
  }, []);

  const playable = cards && pool.length > 0;
  // HSdle's Unlimited: the menu's sets and rarities, over every card (locations too). Its dailies ignore the menu.
  const hsdlePool = useMemo(() => filterPool(everything, excludedSets, excludedRarities), [everything, excludedSets, excludedRarities]);
  return (
    <>
      <TitleBar route={route} />
      <CardZoomHost />
      <div className={`app app-${route}`}>
        <main>
          {error && <div className="panel feedback bad">{error}</div>}
          {!cards && !error && <div className="panel center muted">Loading cards…</div>}
          {cards && route === 'menu' && (
            <Menu
              count={pool.length}
              banner={
                incoming && (
                  <SharedBanner
                    setup={incoming}
                    onAccept={() => {
                      applySetup(incoming);
                      closeIncoming();
                    }}
                    onDismiss={closeIncoming}
                  />
                )
              }
            >
              <RarityPicker cards={setPool} excluded={excludedRarities} onChange={updateRarities} />
              <SetPicker cards={cards} excluded={excludedSets} onChange={updateSets} />
              <SharePanel excludedSets={excludedSets} excludedRarities={excludedRarities} onApply={applySetup} />
            </Menu>
          )}
          {cards && route === 'gauntlet' && pool.length === 0 && (
            <div className="panel center">
              No cards match your sets and rarities. <a href="#/">Change them.</a>
            </div>
          )}
          {playable && route === 'gauntlet' && <Gauntlet cards={pool} />}
          {cards && route === 'hsdle' && <Hsdle all={everything} pool={hsdlePool} />}
          {cards && route === 'pvp' && <Pvp everything={everything} cards={cards} pool={pool} />}
          {/* Every card, not the menu's pool: it's for finding any card (locations too). */}
          {cards && route === 'carddb' && <CardDb cards={everything} />}
          {cards && route === 'card' && <CardPreview cards={everything} />}
        </main>
        <footer className="muted small">
          Unofficial fan site. Data from <a href="https://hearthstonejson.com">HearthstoneJSON</a>. Hearthstone © Blizzard.
        </footer>
      </div>
    </>
  );
}
