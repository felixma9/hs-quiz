import type React from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Card } from '../../../lib/types';
import { Art, useArtCrop } from '../../hsdle/Art';
import { zoomCard } from '../../../app/CardZoom';
import { Bold, ClassName } from '../Bold';
import { ICON, rarityIcon } from '../../../app/icons';
import { load, save } from '../../../lib/storage';
import { isMuted, setMuted, sfx, unlock } from '../../../lib/sound';
import { FUSE_FOR, FUSE_OPTIONS, LIVES_OPTIONS, PartyGame, STEALS_FOR_LIFE, VS_PLAYERS, type PartySettings, type PublicState, type RoomGame } from './game';
import { ATTR, labelFor, plainText, pretty, type AttrKey } from '../../../lib/attributes';
import { GameCard } from '../../../card/GameCard';
import { preloadArt } from '../../../card/sunwell';
import { howTo } from '../../gauntlet/round';
import { loadSettings } from '../../gauntlet/settings';
import { hostRoom, joinRoom, roomLink, type GuestRoom, type HostRoom } from './net';

const HOST_ID = 'host';
/** Hearthstone's health drop (from the card frame assets), one per life. */
const HEALTH_ICON = ICON.health;
const MANA_ICON = ICON.mana;
/** Card art behind the room code: Al'Akir, as on the Quickfire home screen. */
const ROOM_ART = 'https://art.hearthstonejson.com/v1/512x/NEW1_010.jpg';

/** Right answers in a row before a player counts as on a hot streak. */
const HOT = 2;
/** Streak levels: warm (2), hot (3-4), blazing (5+). */
const hotClass = (n: number) => (n >= 5 ? 'hot hot-3' : n >= 3 ? 'hot hot-2' : n >= HOT ? 'hot hot-1' : '');

interface Typing {
  id: string;
  text: string;
  /** Set (to the miss event's number) when this text was a rejected guess. */
  wrong?: number;
}

/** Host or join a room, or play the same game alone (no network). */
export type PartyMode = { role: 'host'; game?: RoomGame } | { role: 'guest'; code: string } | { role: 'solo' };

interface Props {
  mode: PartyMode;
  name: string;
  /** Cards prompts are built from (every collectible card). */
  pool: Card[];
  all: Card[];
  /** Cards the renderer can draw (Gauntlet VS name suggestions and tribe lists). */
  drawable: Card[];
  /** Gauntlet VS cards when this browser hosts (the menu's pool). */
  vsPool: Card[];
  onLeave(): void;
}

/** A Quickfire room: connection, then lobby / game / results for everyone. */
export function Party({ mode, name, pool, all, drawable, vsPool, onLeave }: Props) {
  const [state, setState] = useState<PublicState | null>(null);
  const [me, setMe] = useState<string | null>(mode.role === 'guest' ? null : HOST_ID);
  const [code, setCode] = useState(mode.role === 'guest' ? mode.code : '');
  const [error, setError] = useState<string | null>(null);
  /** What the current player is typing; `wrong` marks a guess the host just rejected (shown in red until they type again). */
  const [typing, setTyping] = useState<Typing | null>(null);
  /** Local time the current fuse burns out (from the snapshot's fuseLeft). */
  const [deadline, setDeadline] = useState(0);

  const game = useRef<PartyGame | null>(null);
  const host = useRef<HostRoom | null>(null);
  const guest = useRef<GuestRoom | null>(null);

  const receive = useCallback((s: PublicState) => {
    setState(s);
    setDeadline(performance.now() + s.fuseLeft);
  }, []);

  // Connect once.
  useEffect(() => {
    let live = true;
    if (mode.role === 'solo') {
      const g = new PartyGame(pool, all, receive);
      game.current = g;
      g.addPlayer(HOST_ID, name);
      const tick = setInterval(() => g.tick(), 150);
      return () => clearInterval(tick);
    }
    if (mode.role === 'host') {
      // Gauntlet VS uses the host's Gauntlet settings (minions only, which fields can be blank).
      const gs = loadSettings();
      const minions = vsPool.filter((c) => c.type === 'MINION');
      const g = new PartyGame(
        pool,
        all,
        (s) => {
          receive(s);
          host.current?.send({ t: 'state', state: s });
        },
        undefined,
        undefined,
        { pool: gs.minionsOnly && minions.length ? minions : vsPool, allowed: gs.allowed },
      );
      game.current = g;
      if (mode.game) g.setSettings({ game: mode.game, fuse: FUSE_FOR[mode.game].default });
      hostRoom({
        onGuestMessage(id, msg) {
          if (msg.t === 'hello') {
            host.current?.send({ t: 'welcome', id }, id);
            g.addPlayer(id, msg.name.slice(0, 20) || 'Player');
          } else if (msg.t === 'answer') g.answer(id, msg.text);
          else if (msg.t === 'typing') {
            setTyping({ id, text: msg.text });
            host.current?.send({ t: 'typing', id, text: msg.text.slice(0, 400) });
          }
        },
        onGuestLeft: (id) => g.removePlayer(id),
        onError: (t) => setError(t),
      }).then(
        (room) => {
          if (!live) return room.close();
          host.current = room;
          setCode(room.code);
          g.addPlayer(HOST_ID, name);
        },
        (e) => live && setError(String(e.message ?? e)),
      );
      const tick = setInterval(() => g.tick(), 150);
      return () => {
        live = false;
        clearInterval(tick);
        host.current?.close();
      };
    }
    const code = mode.code;
    joinRoom(code, name, {
      onMessage(msg) {
        if (msg.t === 'state') receive(msg.state);
        else if (msg.t === 'welcome') setMe(msg.id);
        else if (msg.t === 'typing') setTyping({ id: msg.id, text: msg.text });
      },
      onClosed: (t) => live && setError(t),
    }).then(
      (room) => {
        if (!live) return room.close();
        guest.current = room;
      },
      (e) => live && setError(String(e.message ?? e)),
    );
    return () => {
      live = false;
      guest.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = (text: string) => {
    if (mode.role !== 'guest') game.current?.answer(HOST_ID, text);
    else guest.current?.send({ t: 'answer', text });
  };
  const sendTyping = (text: string) => {
    if (mode.role === 'host') host.current?.send({ t: 'typing', id: HOST_ID, text: text.slice(0, 400) });
    else guest.current?.send({ t: 'typing', text });
  };

  // Sounds for what just happened in the room.
  const lastN = state?.last?.n;
  useEffect(() => {
    const e = state?.last;
    if (!e) return;
    if (e.kind === 'hit') sfx.hit(e.player === me, e.streak);
    else if (e.kind === 'miss') {
      sfx.miss();
      setTyping({ id: e.player, text: e.guess, wrong: e.n });
    } else if (e.kind === 'boom') {
      // A missed steal costs no life: just the miss sound.
      if (e.safe) sfx.miss();
      else sfx.boom();
    }
    else if (e.kind === 'info' && e.text.endsWith('joined') && mode.role !== 'solo') sfx.join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastN]);
  const myTurnNow = state?.phase === 'playing' && state.turn === me;
  useEffect(() => {
    // After a boom, let the explosion finish before the chime.
    if (myTurnNow) {
      const t = setTimeout(() => sfx.yourTurn(), state?.last?.kind === 'boom' ? 450 : 120);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurnNow, state?.round]);
  const keyboardOpen = useKeyboardOpen();

  // Solo: best number of cards named, per lives/seconds setting.
  const soloBest = useSoloBest(mode.role === 'solo' ? state : null);

  // Gauntlet VS: load the next card's art during this turn, so it shows up straight away.
  const nextCard = state?.nextCard;
  useEffect(() => {
    const c = nextCard ? all.find((x) => x.id === nextCard) : undefined;
    if (c) preloadArt(c);
  }, [nextCard, all]);

  // A new turn starts with an empty speech bubble.
  useEffect(() => setTyping(null), [state?.round]);
  const over = state?.phase === 'over';
  useEffect(() => {
    if (!over) return;
    // Solo: the fanfare is for a new best (soloBest still holds the previous one here).
    const won = mode.role === 'solo' ? (state?.players[0]?.hits ?? 0) > soloBest.best : state?.winner === me;
    const t = setTimeout(() => (won ? sfx.win() : sfx.lose()), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  if (error) {
    return (
      <div className="mode party">
        <div className="feedback bad">
          <div className="feedback-head">Room closed</div>
          {error}
        </div>
        <button className="btn primary" onClick={onLeave}>
          Back
        </button>
      </div>
    );
  }
  if (!state || !me) {
    return (
      <div className="mode party">
        <div className="panel center muted">{mode.role === 'host' ? 'Opening a room…' : `Joining room ${code}…`}</div>
        <button className="btn" onClick={onLeave}>
          Cancel
        </button>
      </div>
    );
  }

  const isHost = mode.role === 'host';
  const kbClass = keyboardOpen && state.phase === 'playing' ? 'kb' : '';
  if (mode.role === 'solo') {
    return (
      <div className={`mode party solo ${kbClass}`}>
        <SoundToggle />
        {state.phase === 'lobby' && (
          <SoloSetup
            state={state}
            best={soloBest.best}
            onSettings={(s) => game.current?.setSettings(s)}
            onStart={() => {
              unlock();
              game.current?.start();
            }}
          />
        )}
        {state.phase === 'playing' && (
          <Play solo state={state} me={me} deadline={deadline} typing={null} all={all} drawable={drawable} onAnswer={answer} onTyping={() => {}} />
        )}
        {state.phase === 'over' && (
          <SoloOver
            state={state}
            best={soloBest.best}
            isNew={soloBest.isNew}
            all={all}
            onAgain={() => {
              unlock();
              game.current?.start();
            }}
            onSettings={() => game.current?.toLobby()}
          />
        )}
        <button className="link party-leave" onClick={onLeave}>
          Back
        </button>
      </div>
    );
  }
  return (
    <div className={`mode party ${kbClass}`}>
      <SoundToggle />
      {state.phase === 'lobby' && (
        <Lobby
          state={state}
          code={code}
          me={me}
          isHost={isHost}
          onSettings={(s) => game.current?.setSettings(s)}
          onStart={() => {
            unlock();
            game.current?.start();
          }}
        />
      )}
      {state.phase === 'playing' && (
        <Play state={state} me={me} deadline={deadline} typing={typing} all={all} drawable={drawable} onAnswer={answer} onTyping={sendTyping} />
      )}
      {state.phase === 'over' && <Over state={state} me={me} isHost={isHost} all={all} onAgain={() => game.current?.toLobby()} />}
      <button className="link party-leave" onClick={onLeave}>
        {isHost ? 'Close room' : 'Leave room'}
      </button>
    </div>
  );
}

/* ---------------- Lobby ---------------- */

function Lobby({
  state,
  code,
  me,
  isHost,
  onSettings,
  onStart,
}: {
  state: PublicState;
  code: string;
  me: string;
  isHost: boolean;
  onSettings(s: Partial<PartySettings>): void;
  onStart(): void;
}) {
  const [copied, setCopied] = useState(false);
  const invite = async () => {
    const url = roomLink(code);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'HS Quiz room', text: `Join my Quickfire room: ${code}`, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the code is on screen anyway */
    }
  };
  const seats = Array.from({ length: state.settings.lives });
  const vs = state.settings.game === 'gauntlet';
  const full = vs && state.players.length >= VS_PLAYERS;
  const canStart = !vs || state.players.length === VS_PLAYERS;
  return (
    <>
      <div className="room-code-box" style={{ '--art': `url(${ROOM_ART})` } as React.CSSProperties}>
        <span className="mode-art room-art" aria-hidden="true" />
        <div className="section-label">{vs ? 'Gauntlet VS room' : 'Room code'}</div>
        <div className="room-code" aria-label={`Room code ${code.split('').join(' ')}`}>
          {code.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${i * 60}ms` }}>
              {ch}
            </span>
          ))}
        </div>
        <button className="btn small invite-btn" onClick={invite}>
          {copied ? 'Link copied' : 'Invite friends'}
        </button>
      </div>

      <section className="lobby-panel">
        <div className="lobby-head">
          <span className="section-label">Players</span>
          <span className="count-pill">{vs ? `${state.players.length}/${VS_PLAYERS}` : state.players.length}</span>
        </div>
        <ul className="party-players">
          {state.players.map((p) => (
            <li key={p.id} className={`party-player-row ${p.id === me ? 'me' : ''}`}>
              <span className="avatar" style={avatarStyle(p.id)}>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="party-player-name">
                {p.name}
                {p.id === me && <span className="tag you">you</span>}
              </span>
              {p.id === HOST_ID && (
                <span className="tag host" title="Host">
                  <span aria-hidden="true">👑</span> host
                </span>
              )}
              <span className="row-lives" aria-label={`${state.settings.lives} lives`}>
                {seats.map((_, k) => (
                  <img key={k} src={HEALTH_ICON} alt="" draggable={false} />
                ))}
              </span>
            </li>
          ))}
          {!full && (
            <li className="party-player-row open-seat" aria-hidden="true">
              <span className="avatar">+</span>
              <span className="party-player-name">
                {vs ? (isHost ? 'Share the code with your opponent' : 'Waiting for an opponent') : isHost ? 'Share the code to fill this seat' : 'Room for more'}
              </span>
            </li>
          )}
        </ul>
      </section>

      <section className="lobby-panel party-settings">
        <div className="lobby-head">
          <span className="section-label">Rules</span>
          {!isHost && <span className="muted small">set by the host</span>}
        </div>
        <div className="setting">
          <span className="setting-label">Game</span>
          <div className="seg game-seg" role="radiogroup" aria-label="Game">
            {(
              [
                ['quickfire', 'Quickfire'],
                ['gauntlet', 'Gauntlet VS'],
              ] as const
            ).map(([g, label]) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={state.settings.game === g}
                className={state.settings.game === g ? 'on' : ''}
                disabled={!isHost}
                onClick={() => onSettings({ game: g })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Setting
          icon={<img className="setting-icon" src={HEALTH_ICON} alt="" />}
          label="Lives"
          options={LIVES_OPTIONS}
          value={state.settings.lives}
          disabled={!isHost}
          onPick={(v) => onSettings({ lives: v })}
        />
        <Setting
          icon={<RopeIcon />}
          label="Seconds per turn"
          options={FUSE_FOR[state.settings.game].options}
          value={state.settings.fuse}
          disabled={!isHost}
          onPick={(v) => onSettings({ fuse: v })}
        />
        <div className="pool-note">
          <img className="setting-icon" src={MANA_ICON} alt="" />
          {vs
            ? `1v1: take turns filling in a card's blank. Miss and you lose a life, and your opponent gets a free shot at stealing the same card (every ${STEALS_FOR_LIFE} steals earns a life). Cards come from the host's card pool and Gauntlet settings: ${state.poolSize.toLocaleString()} cards.`
            : `Every collectible card counts: ${state.poolSize.toLocaleString()} cards.`}
        </div>
      </section>

      {isHost ? (
        <button className="btn primary" onClick={onStart} disabled={!canStart}>
          {vs
            ? state.players.length < VS_PLAYERS
              ? 'Waiting for an opponent'
              : state.players.length > VS_PLAYERS
                ? `Gauntlet VS is 1v1 (${state.players.length} here)`
                : 'Start Gauntlet VS'
            : state.players.length > 1
              ? 'Start game'
              : 'Start (just you)'}
        </button>
      ) : (
        <div className="waiting-pill" role="status">
          <span className="pulse-dot" aria-hidden="true" />
          Waiting for the host to start
        </div>
      )}
    </>
  );
}

/** The rope as a little icon: a ring of cord with a flame at its end (the lobby's seconds setting). */
function RopeIcon() {
  return (
    <svg className="setting-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="8" fill="none" stroke="#c9a064" strokeWidth="3.2" />
      <circle cx="12" cy="13" r="8" fill="none" stroke="#7a5730" strokeWidth="3.2" strokeDasharray="1 1.6" />
      <circle cx="6.4" cy="7.4" r="3" fill="#ffb347" />
      <circle cx="6.4" cy="7.4" r="1.4" fill="#fff3c4" />
    </svg>
  );
}

function Setting({
  icon,
  label,
  options,
  value,
  disabled,
  onPick,
}: {
  icon?: React.ReactNode;
  label: string;
  options: number[];
  value: number;
  disabled: boolean;
  onPick(v: number): void;
}) {
  return (
    <div className="setting">
      <span className="setting-label">
        {icon}
        {label}
      </span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            className={o === value ? 'on' : ''}
            disabled={disabled}
            onClick={() => onPick(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Game ---------------- */

function Play({
  solo = false,
  state,
  me,
  deadline,
  typing,
  all,
  drawable,
  onAnswer,
  onTyping,
}: {
  state: PublicState;
  me: string;
  deadline: number;
  typing: Typing | null;
  all: Card[];
  drawable: Card[];
  onAnswer(text: string): void;
  onTyping(text: string): void;
  /** Practising alone: show the running score instead of whose turn it is. */
  solo?: boolean;
}) {
  const crop = useArtCrop();
  const [input, setInput] = useState('');
  /** My last guess was rejected and I haven't changed it yet: show it in red. */
  const [myWrong, setMyWrong] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const vs = !!state.card;
  const myTurn = state.turn === me;
  const current = state.players.find((p) => p.id === state.turn);
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);

  // Whole seconds left. Only this (not the rope's smooth burn) re-renders the screen, once a second:
  // re-rendering everything 10x a second made phones re-scroll to the focused field while you held the page.
  const [left, setLeft] = useState(() => Math.ceil(Math.max(0, deadline - performance.now()) / 1000));
  useEffect(() => {
    const t = setInterval(() => {
      const v = Math.ceil(Math.max(0, deadline - performance.now()) / 1000);
      setLeft((was) => (was === v ? was : v));
    }, 100);
    return () => clearInterval(t);
  }, [deadline]);

  // New turn: clear the box, and focus it if it's mine.
  useEffect(() => {
    setInput('');
    setMyWrong(false);
    if (myTurn) field.current?.focus();
  }, [state.round, myTurn]);

  // Shake my box when the host rejects my answer.
  const last = state.last;
  useEffect(() => {
    if (last?.kind === 'miss' && last.player === me && field.current) {
      setMyWrong(true);
      const el = field.current;
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
  }, [last, me]);

  // The pointer turns the short way round to whoever's up.
  const n = state.players.length;
  const seatAngle = (i: number) => (n ? (i / n) * 360 : 0);
  const turnIdx = Math.max(
    0,
    state.players.findIndex((p) => p.id === state.turn),
  );
  const angle = useRef(0);
  const target = seatAngle(turnIdx);
  const delta = ((((target - angle.current) % 360) + 540) % 360) - 180;
  angle.current += delta;

  const total = state.turnSeconds || state.settings.fuse;
  const urgent = left <= 3;
  // Tick each of the last few seconds.
  const secs = left;
  useEffect(() => {
    if (secs > 0 && secs <= 3) sfx.tick(true);
    else if (secs > 3 && secs <= 5) sfx.tick(false);
  }, [secs]);
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? 'Someone';
  const typed = typing && typing.id === state.turn ? typing.text : '';
  const hitCard = last?.kind === 'hit' ? byId.get(last.cardId) : undefined;

  // A buzz on phones that can when it becomes your turn.
  useEffect(() => {
    if (myTurn && !solo) navigator.vibrate?.(60);
  }, [myTurn, state.round, solo]);

  return (
    <>
      {solo ? (
        <div className="solo-score" role="status">
          <b key={state.players[0]?.hits}>{state.players[0]?.hits ?? 0}</b>
          <span>card{state.players[0]?.hits === 1 ? '' : 's'}</span>
        </div>
      ) : vs ? null : (
        <div className={`turn-banner ${myTurn ? 'mine' : ''}`} key={`turn-${state.round}`} role="status">
          {current && (
            <span className="avatar" style={avatarStyle(current.id)}>
              {current.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="turn-banner-text">
            {myTurn ? 'Your turn!' : `${current?.name ?? '…'}'s turn`}
          </span>
        </div>
      )}
      {myTurn && !solo && <div className="my-turn-glow" aria-hidden="true" />}
      {vs ? (
        <VsBar state={state} me={me} deadline={deadline} total={total} left={left} urgent={urgent} />
      ) : (
      <div className={`table ${myTurn ? 'compact' : ''} ${solo ? 'solo' : ''} ${urgent ? 'urgent' : ''}`}>
        <div className="needle" style={{ transform: `rotate(${angle.current}deg)` }} aria-hidden="true" />
        <div className={`table-center ${last?.kind === 'boom' ? 'boom' : ''}`} key={last?.kind === 'boom' ? `boom-${last.n}` : 'center'}>
          <RopeRing deadline={deadline} total={total} key={`rope-${state.round}`} />
          {state.streak >= 2 && (
            <span className="speed-badge" key={`speed-${state.streak}`} title={`${state.streak} right in a row`}>
              ⚡ {state.turnSeconds}s
            </span>
          )}
          <span className="fuse-count" key={urgent ? Math.ceil(left) : 'calm'} aria-label={`${Math.ceil(left)} seconds left`}>
            {Math.ceil(left)}
          </span>
          {hitCard && (
            <span className="center-hit" key={`hit-${last!.n}`} aria-hidden="true">
              <Art card={hitCard} crop={crop} className="center-art" />
            </span>
          )}
        </div>
        {state.players.map((p, i) => {
          const a = seatAngle(i);
          const boom = last?.kind === 'boom' && last.player === p.id;
          // Bubbles on the left/right seats grow inward so they stay on screen.
          const x = Math.sin((a * Math.PI) / 180);
          const side = x < -0.35 ? 'left' : x > 0.35 ? 'right' : 'mid';
          // Your own words are in your input box, so only other players get a bubble.
          const speaking = p.id === state.turn && p.id !== me;
          // Gauntlet VS shows their answer on the card instead.
          const words = speaking && !vs ? typed : '';
          const wrong = speaking && typing?.wrong && typing.id === p.id ? typing.wrong : 0;
          return (
            <div
              key={p.id + (boom ? `-boom-${last!.n}` : '')}
              className={`seat ${p.id === state.turn ? 'active' : ''} ${p.lives === 0 ? 'out' : ''} ${boom ? 'boom' : ''} ${p.id === me ? 'me' : ''} ${hotClass(p.streak)}`}
              style={{ '--a': `${a}deg` } as React.CSSProperties}
            >
              {speaking && (
                <span className={`bubble side-${side} ${wrong ? 'wrong' : ''}`} key={`bubble-${state.round}-${wrong}`} aria-live="off">
                  {words ? (
                    <span className={`bubble-text ${wrong ? 'wrong' : ''}`} key={wrong || 'typing'}>
                      {words}
                    </span>
                  ) : (
                    <span className="bubble-dots" aria-label="thinking" />
                  )}
                </span>
              )}
              <span className="avatar-wrap">
                <span className="avatar" style={avatarStyle(p.id)}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                {p.streak >= HOT && (
                  <span className="hot-badge" key={`hot-${p.streak}`} aria-label={`${p.streak} in a row`}>
                    🔥{p.streak}
                  </span>
                )}
              </span>
              <span className="seat-name">{p.id === me ? 'You' : p.name}</span>
              <span className="seat-lives" aria-label={`${p.lives} lives`}>
                {p.lives > 0
                  ? Array.from({ length: state.settings.lives }, (_, k) => (
                      <img key={k} className={`life ${k < p.lives ? 'on' : ''}`} src={HEALTH_ICON} alt="" draggable={false} />
                    ))
                  : 'out'}
              </span>
            </div>
          );
        })}
      </div>
      )}

      {state.card ? (
        <>
        <EventLine last={last} me={me} nameOf={nameOf} byId={byId} crop={crop} />
        <VsCard
          key={state.round}
          state={state}
          myTurn={myTurn}
          who={current?.name ?? 'Someone'}
          typed={typed}
          byId={byId}
          drawable={drawable}
          onTyping={onTyping}
          onAnswer={onAnswer}
        />
        </>
      ) : (
      <>
      <div className={`qf-prompt party-prompt ${myTurn ? 'mine' : ''}`} key={state.round}>
        <div className="qf-text">{state.prompt && <Bold text={state.prompt.text} />}</div>
        {state.prompt?.hint && (
          <div className="muted small prompt-hint">
            <ClassName name={state.prompt.hint} />
          </div>
        )}
      </div>

      {myTurn ? (
        <form
          className="qf-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) onAnswer(input);
          }}
        >
          <input
            ref={field}
            className={`in qf-input ${myWrong ? 'wrong' : ''}`}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setMyWrong(false);
              onTyping(e.target.value);
            }}
            placeholder="Card name"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="go"
            aria-label="Card name"
          />
          <button type="submit" className="btn primary" onMouseDown={(e) => e.preventDefault()} disabled={!input.trim()}>
            Go
          </button>
        </form>
      ) : null}
      </>
      )}

      {!vs && <EventLine last={last} me={me} nameOf={nameOf} byId={byId} crop={crop} />}
    </>
  );
}

/** Gauntlet VS scoreboard: you on the left, the rope in the middle, your opponent on the right. */
function VsBar({
  state,
  me,
  deadline,
  total,
  left,
  urgent,
}: {
  state: PublicState;
  me: string;
  deadline: number;
  total: number;
  left: number;
  urgent: boolean;
}) {
  const last = state.last;
  const seated = state.players.filter((p) => p.lives > 0 || p.outAt > 0 || state.players.length <= VS_PLAYERS).slice(0, VS_PLAYERS);
  const [a, b] = [...seated].sort((x, y) => Number(y.id === me) - Number(x.id === me));
  const side = (p: PublicState['players'][number]) => {
    const boom = last?.kind === 'boom' && last.player === p.id && !last.safe;
    return (
      <div
        key={p.id + (boom ? `-boom-${last!.n}` : '')}
        className={`vs-side ${p.id === state.turn ? 'active' : ''} ${boom ? 'boom' : ''} ${p.id === me ? 'me' : ''} ${p.lives === 0 ? 'out' : ''}`}
      >
        <span className="avatar-wrap">
          <span className="avatar" style={avatarStyle(p.id)}>
            {p.name.slice(0, 1).toUpperCase()}
          </span>
          {p.streak >= HOT && (
            <span className="vs-hot" key={`hot-${p.streak}`} aria-label={`${p.streak} in a row`}>
              🔥{p.streak}
            </span>
          )}
        </span>
        <span className="vs-name">{p.id === me ? 'You' : p.name}</span>
        <span className="seat-lives" aria-label={`${p.lives} lives`}>
          {/* Extra lives from steals add hearts beyond the starting ones. */}
          {Array.from({ length: Math.max(state.settings.lives, p.lives) }, (_, k) => (
            <img key={k} className={`life ${k < p.lives ? 'on' : ''}`} src={HEALTH_ICON} alt="" draggable={false} />
          ))}
        </span>
        {/* Steals toward the next extra life. */}
        <span className="steal-pips" title={`${(p.steals ?? 0) % STEALS_FOR_LIFE} of ${STEALS_FOR_LIFE} steals for an extra life`}>
          {Array.from({ length: STEALS_FOR_LIFE }, (_, k) => (
            <i key={k} className={k < (p.steals ?? 0) % STEALS_FOR_LIFE ? 'on' : ''} />
          ))}
        </span>
      </div>
    );
  };
  return (
    <div className={`vs-bar ${urgent ? 'urgent' : ''} ${state.turn === me ? 'mine' : ''}`} role="status">
      {a && side(a)}
      <div className={`vs-clock ${last?.kind === 'boom' ? 'boom' : ''}`} key={last?.kind === 'boom' ? `boom-${last.n}` : 'clock'}>
        <RopeRing deadline={deadline} total={total} key={`rope-${state.round}`} />
        <span className="fuse-count" key={urgent ? Math.ceil(left) : 'calm'} aria-label={`${Math.ceil(left)} seconds left`}>
          {Math.ceil(left)}
        </span>
        {/* Whose turn, in place of the big banner. */}
        <span className="vs-turn-label" key={`turn-${state.round}`}>
          {state.turn === me ? 'Your turn' : `${state.players.find((x) => x.id === state.turn)?.name ?? '…'}'s turn`}
        </span>
      </div>
      {b && side(b)}
    </div>
  );
}

/** Gauntlet VS: this turn's card. The player whose turn it is fills in the blank; the other watches it fill in live. */
function VsCard({
  state,
  myTurn,
  who,
  typed,
  byId,
  drawable,
  onTyping,
  onAnswer,
}: {
  state: PublicState;
  myTurn: boolean;
  who: string;
  typed: string;
  byId: Map<string, Card>;
  drawable: Card[];
  onTyping(text: string): void;
  onAnswer(text: string): void;
}) {
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState(false);
  const card = byId.get(state.card!.id);
  const key = state.card!.hidden;
  const hidden = useMemo(() => new Set<AttrKey>([key]), [key]);
  const editable = useMemo(() => new Set<AttrKey>(myTurn ? [key] : []), [key, myTurn]);
  if (!card) return <div className="panel center muted">Card not found.</div>;
  const attr = ATTR[key];
  const label = labelFor(attr, card).toLowerCase();
  const canSend = !sent && (attr.kind === 'text' || draft !== '');
  const submit = () => {
    if (!canSend) return;
    setSent(true);
    onAnswer(draft);
  };
  return (
    <div className={`vs-turn ${myTurn ? 'mine' : ''}`}>
      <div className="vs-ask">
        {state.card!.steal && <span className="steal-tag">{myTurn ? 'Steal!' : 'Steal'}</span>}
        {myTurn ? (
          <>
            Fill in the <b>{label}</b>:{' '}
            {key === 'text' ? 'tap the text box and type the gist (shorthand like "dmg" is fine). Double time.' : howTo(key)}
          </>
        ) : (
          <>
            {who} is {state.card!.steal ? 'trying to steal' : 'filling in'} the <b>{label}</b>
            {key === 'text' && ' (double time)'}
          </>
        )}
      </div>
      <div className="vs-card" data-card={card.id} data-hidden={key}>
        <GameCard
          card={card}
          hidden={hidden}
          draft={{ [key]: myTurn ? draft : typed }}
          editable={editable}
          onChange={
            myTurn
              ? (_, v) => {
                  setDraft(v);
                  onTyping(v);
                }
              : undefined
          }
          pool={drawable}
          onEnter={submit}
        />
      </div>
      {myTurn && (
        <form
          className="vs-actions"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <button type="submit" className="btn primary" disabled={!canSend}>
            Submit
          </button>
        </form>
      )}
    </div>
  );
}

function EventLine({
  last,
  me,
  nameOf,
  byId,
  crop,
}: {
  last: PublicState['last'];
  me: string;
  nameOf(id: string): string;
  byId: Map<string, Card>;
  crop: Record<string, number>;
}) {
  if (!last) return <div className="party-event"> </div>;
  const who = (id: string) => (id === me ? 'You' : nameOf(id));
  let body: React.ReactNode;
  let cls = '';
  if (last.kind === 'hit') {
    const c = byId.get(last.cardId);
    cls = 'ok';
    body = (
      <>
        {c && <Art card={c} crop={crop} className="qf-thumb event-thumb" zoom />}
        {last.attr ? (
          <span>
            {last.stole ? '🗡' : '✓'} {who(last.player)} {last.stole ? 'stole' : 'got'} {c?.name}'s {c ? labelFor(ATTR[last.attr], c).toLowerCase() : last.attr}
            {last.attr !== 'name' && last.attr !== 'text' && c && (
              <>
                : <b>{pretty(last.attr, ATTR[last.attr].value(c))}</b>
              </>
            )}
            {last.attr === 'text' && c?.text && (
              <span className="vs-reveal hit-text">
                <span className="vs-reveal-text">{plainText(c.text)}</span>
              </span>
            )}
            {last.bonusLife && (
              <b className="bonus-life">
                {' '}
                +1 <img className="stat-icon" src={HEALTH_ICON} alt="life" /> ({STEALS_FOR_LIFE} steals)
              </b>
            )}
          </span>
        ) : (
          <span>
            {who(last.player)}: <b>{c?.name}</b>
          </span>
        )}
        {last.streak >= HOT && (
          <span className={`hot-callout ${hotClass(last.streak)}`}>
            🔥 {last.streak} in a row{last.streak >= 5 ? '!' : ''}
          </span>
        )}
      </>
    );
  } else if (last.kind === 'miss') {
    cls = 'bad';
    body = <span>✗ {last.text}</span>;
  } else if (last.kind === 'boom' && last.cardId) {
    // Gauntlet VS: a wrong answer or a burnt rope. Passed on for a steal, or the answer.
    const c = byId.get(last.cardId);
    const field = c && last.attr ? labelFor(ATTR[last.attr], c).toLowerCase() : 'answer';
    const what =
      last.guess !== undefined ? (
        <>
          ✗ {who(last.player)} said <b>{last.guess}</b>.
        </>
      ) : (
        <>💥 {who(last.player)} ran out of time.</>
      );
    cls = 'boom';
    if (last.passed) {
      body = (
        <span>
          {what} {last.player === me ? 'Over to your opponent.' : <b className="steal-call">Your chance to steal!</b>}
        </span>
      );
    } else {
      const out = last.out ? (last.player === me ? ' You are out!' : ` ${nameOf(last.player)} is out!`) : '';
      const nobody = last.nobody ? `${last.safe ? 'No life lost. ' : ''}Nobody got it. ` : '';
      if (last.reveal !== undefined) {
        cls = 'boom reveal';
        body = (
          <>
            <span>
              {what} {nobody}
              {out}
            </span>
            <span className="vs-reveal">
              {c && <Art card={c} crop={crop} className="qf-thumb event-thumb" zoom />}
              <span>
                <b>{c?.name}</b>
                {/* The host sends the text; this browser's copy of the card is the fallback. */}
                <span className="vs-reveal-text">{last.reveal || plainText(c?.text) || '(no text)'}</span>
              </span>
            </span>
          </>
        );
      } else {
        body = (
          <>
            {c && <Art card={c} crop={crop} className="qf-thumb event-thumb" zoom />}
            <span>
              {what} {nobody}
              {last.example && (
                <>
                  {c?.name}'s {field} is <b>{last.example}</b>.
                </>
              )}
              {out}
            </span>
          </>
        );
      }
    }
  } else if (last.kind === 'boom') {
    cls = 'boom';
    body = (
      <span>
        💥 {who(last.player)} ran out of time{last.out ? (last.player === me ? ' and are out!' : ' and is out!') : ''}
        {last.example && <span className="muted"> (e.g. {last.example})</span>}
      </span>
    );
  } else {
    body = <span className="muted">{last.text}</span>;
  }
  return (
    <div className={`party-event ${cls}`} key={last.n}>
      {body}
    </div>
  );
}

/* ---------------- Results ---------------- */

const PLACE_GEM = ['LEGENDARY', 'EPIC', 'RARE'];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function Over({ state, me, isHost, all, onAgain }: { state: PublicState; me: string; isHost: boolean; all: Card[]; onAgain(): void }) {
  const winner = state.players.find((p) => p.id === state.winner);
  const ranked = [...state.players].sort(
    (a, b) => Number(b.id === state.winner) - Number(a.id === state.winner) || b.lives - a.lives || b.outAt - a.outAt || b.hits - a.hits,
  );
  // Podium order: 2nd, 1st, 3rd.
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
  const rest = ranked.slice(3);
  const place = (id: string) => ranked.findIndex((p) => p.id === id) + 1;
  return (
    <div className="panel party-over">
      <div className="over-head">
        <span className="over-kicker">Game over</span>
        <h2>{winner ? (winner.id === me ? 'You win!' : `${winner.name} wins!`) : 'No winner'}</h2>
      </div>
      <div className={`podium ${podium.length === 2 ? "two" : ""}`}>
        {podium.map((p) => {
          const n = place(p.id);
          return (
            <div key={p.id} className={`podium-spot place-${n} ${p.id === me ? 'me' : ''}`}>
              {n === 1 && (
                <span className="crown" aria-hidden="true">
                  👑
                </span>
              )}
              <span className="avatar" style={avatarStyle(p.id)}>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="podium-name">{p.id === me ? 'You' : p.name}</span>
              <span className="podium-block">
                <img className="podium-gem" src={rarityIcon(PLACE_GEM[n - 1])} alt="" draggable={false} />
                <b>{ordinal(n)}</b>
                <small>{plural(p.hits, 'card')}</small>
                {p.bestStreak >= HOT && <small className="podium-streak">🔥 {p.bestStreak} in a row</small>}
              </span>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <ol className="party-ranking">
          {rest.map((p) => (
            <li key={p.id} className={p.id === me ? 'me' : ''}>
              <span className="rank">{ordinal(place(p.id))}</span>
              <span className="avatar" style={avatarStyle(p.id)}>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="party-player-name">{p.id === me ? `${p.name} (you)` : p.name}</span>
              <span className="muted small">{plural(p.hits, 'card')}</span>
            </li>
          ))}
        </ol>
      )}
      <NamedCards state={state} me={me} all={all} />
      {isHost ? (
        <button className="btn primary" onClick={onAgain}>
          Back to lobby
        </button>
      ) : (
        <div className="waiting-pill" role="status">
          <span className="pulse-dot" aria-hidden="true" />
          Waiting for the host
        </div>
      )}
    </div>
  );
}

/** Every card named this game, as a strip of art; tap one for its name. */
function NamedCards({ state, me, all }: { state: PublicState; me: string; all: Card[] }) {
  const crop = useArtCrop();
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
  const [open, setOpen] = useState<number | null>(null);
  const list = state.named.map((x) => ({ ...x, card: byId.get(x.cardId) })).filter((x) => x.card);
  if (!list.length) return null;
  const solo = state.players.length === 1;
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?';
  const who = (id: string) => (id === me ? 'you' : nameOf(id));
  const sel = open !== null ? list[open] : null;
  return (
    <section className="named">
      <div className="lobby-head">
        <span className="section-label">{state.settings.game === 'gauntlet' ? 'Cards played' : 'Cards named'}</span>
        <span className="count-pill">{list.length}</span>
      </div>
      <div className="named-strip">
        {list.map((x, i) => (
          <button
            key={x.cardId}
            type="button"
            className={`named-card ${x.ok === undefined ? '' : x.ok ? 'run-card ok' : 'run-card bad'} ${open === i ? 'on' : ''}`}
            style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
            title={x.card!.name}
            onClick={() => {
              setOpen(i);
              zoomCard(x.card!, solo ? undefined : `${x.ok === undefined ? 'Named by' : x.ok ? 'Got right by' : 'Missed by'} ${who(x.player)}`);
            }}
          >
            <Art card={x.card!} crop={crop} className="named-art" />
            {x.ok !== undefined && <span className="run-mark">{x.ok ? '✓' : '✗'}</span>}
            {/* Gauntlet VS marks right/wrong instead; the caption says who. */}
            {!solo && x.ok === undefined && (
              <span className="avatar mini" style={avatarStyle(x.player)}>
                {nameOf(x.player).slice(0, 1).toUpperCase()}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="named-caption muted small">
        {sel ? (
          <>
            <b>{sel.card!.name}</b>
            {!solo && <> · {sel.ok === undefined ? 'named by' : sel.ok ? 'got right by' : 'missed by'} {who(sel.player)}</>}
          </>
        ) : (
          'Tap a card to see it.'
        )}
      </div>
    </section>
  );
}

/** A stable two-tone gradient per player id. */
function avatarStyle(id: string): React.CSSProperties {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { background: `linear-gradient(140deg, hsl(${h} 70% 58%), hsl(${(h + 40) % 360} 60% 36%))` };
}

/** Sound on/off, remembered on this device. */
function SoundToggle() {
  const [off, setOff] = useState(isMuted);
  return (
    <button
      type="button"
      className={`sound-toggle ${off ? 'off' : ''}`}
      aria-pressed={!off}
      aria-label={off ? 'Turn sound on' : 'Turn sound off'}
      onClick={() => {
        setMuted(!off);
        setOff(!off);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        {off ? (
          <path d="M17 9l5 6M22 9l-5 6" className="stroke" />
        ) : (
          <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" className="stroke" />
        )}
      </svg>
    </button>
  );
}

/**
 * The turn timer: a rope laid round the middle of the table that burns down
 * (from the top, clockwise) with a glowing ember at the burning end.
 */
/** The burning rope. It ticks on its own so only the ring redraws, not the whole screen. */
function RopeRing({ deadline, total }: { deadline: number; total: number }) {
  const id = useId();
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let raf = 0;
    let lastAt = 0;
    const loop = (t: number) => {
      // About 10 updates a second is plenty for a rope.
      if (t - lastAt > 90) {
        lastAt = t;
        setNow(performance.now());
      }
      if (performance.now() < deadline) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [deadline]);
  const frac = Math.min(1, Math.max(0, deadline - now) / 1000 / total);
  const R = 44;
  const C = 2 * Math.PI * R;
  // Gold while there's time, then orange, then red.
  const phase = frac > 0.5 ? 'calm' : frac > 0.25 ? 'warm' : 'hot';
  // The ember rides a ring the size of the SVG, turned (not moved) so the browser never re-lays out the page.
  const deg = frac * 360;
  return (
    <>
      <svg className={`rope-ring ${phase}`} viewBox="0 0 100 100" aria-hidden="true">
        <circle className="rope-track" cx="50" cy="50" r={R} />
        <g transform="rotate(-90 50 50)">
          <circle className="rope-cord" cx="50" cy="50" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
          {/* A fine braid over the cord, cut to the same length. */}
          <circle className="rope-braid" cx="50" cy="50" r={R} strokeDasharray={`0.9 1.9`} mask={`url(#${id})`} />
        </g>
        <defs>
          <mask id={id} maskUnits="userSpaceOnUse">
            <circle cx="50" cy="50" r={R} fill="none" stroke="#fff" strokeWidth="8" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
          </mask>
        </defs>
      </svg>
      {frac > 0 && (
        <span className={`rope-orbit ${phase}`} style={{ transform: `rotate(${deg.toFixed(1)}deg)` }}>
          <span className="rope-ember" style={{ top: `${50 - R}%` }}>
            <span className="ember-glow" />
            <span className="ember-core" />
          </span>
        </span>
      )}
    </>
  );
}

/* ---------------- Solo ---------------- */

const soloKey = (s: PartySettings) => `hsq:quickfire:best:${s.lives}-${s.fuse}`;

/** Remembers the best solo run for the current settings; `isNew` after a record. */
function useSoloBest(state: PublicState | null) {
  const [best, setBest] = useState(0);
  const [isNew, setIsNew] = useState(false);
  const key = state ? soloKey(state.settings) : '';
  useEffect(() => {
    if (key) setBest(load<number>(key, 0));
  }, [key]);
  const phase = state?.phase;
  useEffect(() => {
    if (!state) return;
    if (phase === 'playing') setIsNew(false);
    if (phase !== 'over') return;
    const hits = state.players[0]?.hits ?? 0;
    const prev = load<number>(key, 0);
    if (hits > prev) {
      save(key, hits);
      setBest(hits);
      setIsNew(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  return { best, isNew };
}

function SoloSetup({
  state,
  best,
  onSettings,
  onStart,
}: {
  state: PublicState;
  best: number;
  onSettings(s: Partial<PartySettings>): void;
  onStart(): void;
}) {
  return (
    <>
      <div className="solo-intro">
        <h2>Practice</h2>
        <p className="muted">
          Same game, just you: name a card for each prompt before the rope burns down. Run out of time and you lose a life.
        </p>
      </div>
      <section className="lobby-panel party-settings">
        <div className="lobby-head">
          <span className="section-label">Rules</span>
        </div>
        <Setting
          icon={<img className="setting-icon" src={HEALTH_ICON} alt="" />}
          label="Lives"
          options={LIVES_OPTIONS}
          value={state.settings.lives}
          disabled={false}
          onPick={(v) => onSettings({ lives: v })}
        />
        <Setting
          icon={<RopeIcon />}
          label="Seconds per turn"
          options={FUSE_OPTIONS}
          value={state.settings.fuse}
          disabled={false}
          onPick={(v) => onSettings({ fuse: v })}
        />
        <div className="pool-note">
          <img className="setting-icon" src={rarityIcon('LEGENDARY')} alt="" />
          <span>
            Best with these rules: <b>{best}</b> card{best === 1 ? '' : 's'}
          </span>
        </div>
      </section>
      <button className="btn primary" onClick={onStart}>
        Start
      </button>
    </>
  );
}

function SoloOver({
  state,
  best,
  isNew,
  all,
  onAgain,
  onSettings,
}: {
  state: PublicState;
  best: number;
  isNew: boolean;
  all: Card[];
  onAgain(): void;
  onSettings(): void;
}) {
  const p = state.players[0];
  const hits = p?.hits ?? 0;
  return (
    <div className="panel party-over solo-over">
      <div className="over-head">
        <span className="over-kicker">Game over</span>
        <h2>{isNew ? 'New best!' : hits ? 'Nice run' : 'Out of rope'}</h2>
      </div>
      <div className={`solo-final ${isNew ? 'record' : ''}`}>
        <b className="qf-count done">{hits}</b>
        <span>{hits === 1 ? 'card' : 'cards'}</span>
      </div>
      <div className="solo-stats">
        <span>
          <small>Best</small>
          <b>{best}</b>
        </span>
        <span>
          <small>Longest streak</small>
          <b>{p?.bestStreak ?? 0}</b>
        </span>
        <span>
          <small>Rules</small>
          <b>
            {state.settings.lives}
            <img className="stat-icon" src={HEALTH_ICON} alt=" lives" /> · {state.settings.fuse}s
          </b>
        </span>
      </div>
      <NamedCards state={state} me={p?.id ?? ''} all={all} />
      <button className="btn primary" onClick={onAgain}>
        Play again
      </button>
      <button className="btn" onClick={onSettings}>
        Change settings
      </button>
    </div>
  );
}

/**
 * Is the on-screen keyboard up? Compares the visible height with the tallest
 * the window has been (works whether the browser shrinks the page or not).
 */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !matchMedia('(pointer: coarse)').matches) return;
    let tallest = Math.max(window.innerHeight, vv.height);
    // Two thresholds, so the toolbar sliding in and out while scrolling doesn't flip the layout back and forth.
    const on = () => {
      tallest = Math.max(tallest, window.innerHeight, vv.height);
      const r = vv.height / tallest;
      setOpen((was) => (was ? r < 0.85 : r < 0.72));
    };
    on();
    vv.addEventListener('resize', on);
    return () => vv.removeEventListener('resize', on);
  }, []);
  return open;
}
