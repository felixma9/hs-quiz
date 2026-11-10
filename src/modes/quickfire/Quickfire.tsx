import type React from 'react';
import { ICON } from '../../app/icons';
import { useEffect, useState } from 'react';
import type { Card } from '../../lib/types';
import { load, save } from '../../lib/storage';
import { unlock } from '../../lib/sound';
import { Party, type PartyMode } from './party/Party';
import { cleanCode, roomFromLocation } from './party/net';

const NAME_KEY = 'hsq:name';

type View = { kind: 'home' } | { kind: 'party'; mode: PartyMode };

/**
 * Quickfire: host or join a room and take turns naming cards before the fuse
 * burns out, or practise alone against the clock.
 */
/** Quickfire always plays with every collectible card (the menu's card pool doesn't apply). */
/** Gauntlet PvP rooms use the menu's card pool (`pool`, or every drawable card if that's empty). */
export function Quickfire({ everything, cards, pool }: { everything: Card[]; cards: Card[]; pool: Card[] }) {
  const [name, setName] = useState(() => load<string>(NAME_KEY, ''));
  const [code, setCode] = useState(() => roomFromLocation() ?? '');
  const [view, setView] = useState<View>({ kind: 'home' });
  const [needName, setNeedName] = useState(false);

  // Opening an invite link fills in the code.
  useEffect(() => {
    const on = () => {
      const r = roomFromLocation();
      if (r) setCode(r);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (mode: PartyMode) => {
    const n = name.trim();
    if (!n) return setNeedName(true);
    save(NAME_KEY, n);
    unlock();
    setView({ kind: 'party', mode });
  };
  const leave = () => {
    history.replaceState(null, '', '#/quickfire');
    setView({ kind: 'home' });
  };

  if (view.kind === 'party')
    return (
      <Party
        mode={view.mode}
        name={name.trim() || 'You'}
        pool={everything}
        all={everything}
        drawable={cards}
        vsPool={pool.length ? pool : cards}
        onLeave={leave}
      />
    );

  const fullCode = cleanCode(code).length === 4;
  return (
    <div className="mode qf-home">
      <div className="qf-hero" style={{ '--art': `url(https://art.hearthstonejson.com/v1/512x/NEW1_010.jpg)` } as React.CSSProperties}>
        <span className="mode-art" aria-hidden="true" />
        <span className="qf-hero-icons" aria-hidden="true">
          <img src={ICON.mana} alt="" />
          <img src={ICON.attack} alt="" />
          <img src={ICON.health} alt="" />
        </span>
      </div>
      <p className="qf-home-intro">
        Take turns naming cards that fit the prompt before the rope burns out. Run out of time and you lose a life. Last one
        standing wins. Or play <b>Gauntlet PvP</b>: take turns filling in a card's blank against the rope.
      </p>

      <label className="qf-name">
        <span className="section-label">Your name</span>
        <input
          className={`in ${needName && !name.trim() ? 'shake' : ''}`}
          value={name}
          maxLength={20}
          onChange={(e) => {
            setName(e.target.value);
            setNeedName(false);
          }}
          placeholder="e.g. Leeroy"
          autoComplete="nickname"
          aria-invalid={needName && !name.trim()}
        />
        {needName && !name.trim() && <span className="small bad-text">Pick a name first.</span>}
      </label>

      <div className="qf-host-row">
        <button className="btn primary qf-host" onClick={() => go({ role: 'host' })}>
          Host a room
        </button>
        <button className="btn qf-host-vs" onClick={() => go({ role: 'host', game: 'gauntlet' })}>
          <img src={ICON.health} alt="" aria-hidden="true" />
          Host Gauntlet PvP
          <small>2–8 players: fill in the blanks</small>
        </button>
      </div>

      <form
        className="qf-join"
        onSubmit={(e) => {
          e.preventDefault();
          if (fullCode) go({ role: 'guest', code: cleanCode(code) });
        }}
      >
        <input
          className="in room-input"
          value={code}
          onChange={(e) => setCode(cleanCode(e.target.value))}
          placeholder="ROOM"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          aria-label="Room code"
        />
        <button className="btn" type="submit" disabled={!fullCode}>
          Join
        </button>
      </form>

      <div className="qf-or">or</div>
      <button
        className="btn qf-solo"
        onClick={() => {
          unlock();
          setView({ kind: 'party', mode: { role: 'solo' } });
        }}
      >
        Practise solo
      </button>
    </div>
  );
}
