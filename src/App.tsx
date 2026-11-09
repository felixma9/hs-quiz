import { useEffect, useState } from 'react';
import type { Card } from './lib/types';
import { loadCards } from './lib/cards';
import { drawable } from './pool/pool';
import { usePool } from './pool/usePool';
import { RarityPicker } from './pool/RarityPicker';
import { SetPicker } from './pool/SetPicker';
import { SharePanel, SharedBanner } from './pool/SharePanel';
import { codeFromLocation, decodeSetup, type SharedSetup } from './pool/shareCode';
import { saveSettings } from './modes/gauntlet/settings';
import { parseRoute, type Route } from './app/routes';
import { TitleBar } from './app/TitleBar';
import { Menu } from './app/Menu';
import { CardPreview } from './app/CardPreview';
import { Gauntlet } from './modes/gauntlet/Gauntlet';
import { Hsdle } from './modes/hsdle/Hsdle';

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  const [cards, setCards] = useState<Card[] | null>(null);
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
    const on = () => {
      setRoute(parseRoute());
      const s = decodeSetup(codeFromLocation() ?? '');
      if (s) setIncoming(s);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    loadCards().then((c) => setCards(drawable(c)), (e) => setError(String(e)));
  }, []);

  const playable = cards && pool.length > 0;
  return (
    <>
      <TitleBar route={route} />
      <div className={`app app-${route}`}>
        <main>
          {error && <div className="panel feedback bad">{error}</div>}
          {!cards && !error && <div className="panel center muted">Loading cards…</div>}
          {cards && route === 'menu' && (
            <Menu count={pool.length}>
              {incoming && (
                <SharedBanner
                  setup={incoming}
                  onAccept={() => {
                    applySetup(incoming);
                    closeIncoming();
                  }}
                  onDismiss={closeIncoming}
                />
              )}
              <RarityPicker cards={setPool} excluded={excludedRarities} onChange={updateRarities} />
              <SetPicker cards={cards} excluded={excludedSets} onChange={updateSets} />
              <SharePanel excludedSets={excludedSets} excludedRarities={excludedRarities} onApply={applySetup} />
            </Menu>
          )}
          {cards && (route === 'gauntlet' || route === 'hsdle') && pool.length === 0 && (
            <div className="panel center">
              No cards match your sets and rarities. <a href="#/">Change them on the menu.</a>
            </div>
          )}
          {playable && route === 'gauntlet' && <Gauntlet cards={pool} />}
          {playable && route === 'hsdle' && <Hsdle cards={pool} />}
          {cards && route === 'card' && <CardPreview cards={cards} />}
        </main>
        <footer className="muted small">
          Card data from <a href="https://hearthstonejson.com">HearthstoneJSON</a>. Hearthstone is © Blizzard Entertainment; this is
          an unofficial fan quiz.
        </footer>
      </div>
    </>
  );
}
