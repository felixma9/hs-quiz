import type React from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Card } from '../../../lib/types';
import { Art, useArtCrop } from '../../hsdle/Art';
import { Bold } from '../Bold';
import { load, save } from '../../../lib/storage';
import { isMuted, setMuted, sfx, unlock } from '../../../lib/sound';
import { FUSE_OPTIONS, LIVES_OPTIONS, PartyGame, type PartySettings, type PublicState } from './game';
import { hostRoom, joinRoom, roomLink, type GuestRoom, type HostRoom } from './net';

const HOST_ID = 'host';

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
export type PartyMode = { role: 'host' } | { role: 'guest'; code: string } | { role: 'solo' };

interface Props {
  mode: PartyMode;
  name: string;
  /** Cards prompts are built from (every collectible card). */
  pool: Card[];
  all: Card[];
  onLeave(): void;
}

/** A Quickfire room: connection, then lobby / game / results for everyone. */
export function Party({ mode, name, pool, all, onLeave }: Props) {
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
      const g = new PartyGame(pool, all, (s) => {
        receive(s);
        host.current?.send({ t: 'state', state: s });
      });
      game.current = g;
      hostRoom({
        onGuestMessage(id, msg) {
          if (msg.t === 'hello') {
            host.current?.send({ t: 'welcome', id }, id);
            g.addPlayer(id, msg.name.slice(0, 20) || 'Player');
          } else if (msg.t === 'answer') g.answer(id, msg.text);
          else if (msg.t === 'typing') {
            setTyping({ id, text: msg.text });
            host.current?.send({ t: 'typing', id, text: msg.text.slice(0, 60) });
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
    if (mode.role === 'host') host.current?.send({ t: 'typing', id: HOST_ID, text: text.slice(0, 60) });
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
    } else if (e.kind === 'boom') sfx.boom();
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
          <Play solo state={state} me={me} deadline={deadline} typing={null} all={all} onAnswer={answer} onTyping={() => {}} />
        )}
        {state.phase === 'over' && (
          <SoloOver
            state={state}
            best={soloBest.best}
            isNew={soloBest.isNew}
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
        <Play state={state} me={me} deadline={deadline} typing={typing} all={all} onAnswer={answer} onTyping={sendTyping} />
      )}
      {state.phase === 'over' && <Over state={state} me={me} isHost={isHost} onAgain={() => game.current?.toLobby()} />}
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
  return (
    <>
      <div className="room-code-box">
        <div className="section-label">Room code</div>
        <div className="room-code" aria-label={`Room code ${code.split('').join(' ')}`}>
          {code.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${i * 60}ms` }}>
              {ch}
            </span>
          ))}
        </div>
        <button className="btn small" onClick={invite}>
          {copied ? 'Link copied' : 'Invite friends'}
        </button>
      </div>

      <div className="party-players">
        <div className="section-label">Players ({state.players.length})</div>
        <ul>
          {state.players.map((p) => (
            <li key={p.id} className="party-player-row">
              <span className="avatar" style={avatarStyle(p.id)}>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="party-player-name">{p.name}</span>
              {p.id === 'host' && <span className="tag">host</span>}
              {p.id === me && <span className="tag you">you</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="party-settings">
        <Setting
          label="Lives"
          options={LIVES_OPTIONS}
          value={state.settings.lives}
          disabled={!isHost}
          onPick={(v) => onSettings({ lives: v })}
        />
        <Setting
          label="Seconds per turn"
          options={FUSE_OPTIONS}
          value={state.settings.fuse}
          disabled={!isHost}
          onPick={(v) => onSettings({ fuse: v })}
        />
        <div className="muted small">Every collectible card counts ({state.poolSize.toLocaleString()} cards).</div>
      </div>

      {isHost ? (
        <button className="btn primary" onClick={onStart}>
          {state.players.length > 1 ? 'Start game' : 'Start (just you)'}
        </button>
      ) : (
        <div className="muted center waiting">
          Waiting for the host to start
          <span className="dots" />
        </div>
      )}
    </>
  );
}

function Setting({
  label,
  options,
  value,
  disabled,
  onPick,
}: {
  label: string;
  options: number[];
  value: number;
  disabled: boolean;
  onPick(v: number): void;
}) {
  return (
    <div className="setting">
      <span>{label}</span>
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
  onAnswer,
  onTyping,
}: {
  state: PublicState;
  me: string;
  deadline: number;
  typing: Typing | null;
  all: Card[];
  onAnswer(text: string): void;
  onTyping(text: string): void;
  /** Practising alone: show the running score instead of whose turn it is. */
  solo?: boolean;
}) {
  const crop = useArtCrop();
  const [input, setInput] = useState('');
  /** My last guess was rejected and I haven't changed it yet: show it in red. */
  const [myWrong, setMyWrong] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const field = useRef<HTMLInputElement>(null);
  const myTurn = state.turn === me;
  const current = state.players.find((p) => p.id === state.turn);
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);

  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, []);

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

  const left = Math.max(0, deadline - now) / 1000;
  const frac = Math.min(1, left / (state.turnSeconds || state.settings.fuse));
  const urgent = left <= 3;
  // Tick each of the last few seconds.
  const secs = Math.ceil(left);
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
      ) : (
        <div className={`turn-banner ${myTurn ? 'mine' : ''}`} key={`turn-${state.round}`} role="status">
          {current && (
            <span className="avatar" style={avatarStyle(current.id)}>
              {current.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="turn-banner-text">{myTurn ? 'Your turn!' : `${current?.name ?? '…'}'s turn`}</span>
        </div>
      )}
      {myTurn && !solo && <div className="my-turn-glow" aria-hidden="true" />}
      <div className={`table ${myTurn ? 'compact' : ''} ${urgent ? 'urgent' : ''}`}>
        <div className="needle" style={{ transform: `rotate(${angle.current}deg)` }} aria-hidden="true" />
        <div className={`table-center ${last?.kind === 'boom' ? 'boom' : ''}`} key={last?.kind === 'boom' ? `boom-${last.n}` : 'center'}>
          <RopeRing frac={frac} key={`rope-${state.round}`} />
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
          const words = speaking ? typed : '';
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
                  ? Array.from({ length: state.settings.lives }, (_, k) => <i key={k} className={k < p.lives ? 'on' : ''} />)
                  : 'out'}
              </span>
            </div>
          );
        })}
      </div>


      <div className={`qf-prompt party-prompt ${myTurn ? 'mine' : ''}`} key={state.round}>
        <div className="qf-text">{state.prompt && <Bold text={state.prompt.text} />}</div>
        {state.prompt?.hint && <div className="muted small">{state.prompt.hint}</div>}
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

      <EventLine last={last} me={me} nameOf={nameOf} byId={byId} crop={crop} />
    </>
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
        {c && <Art card={c} crop={crop} className="qf-thumb event-thumb" />}
        <span>
          {who(last.player)}: <b>{c?.name}</b>
        </span>
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

function Over({ state, me, isHost, onAgain }: { state: PublicState; me: string; isHost: boolean; onAgain(): void }) {
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
      <h2>{winner ? (winner.id === me ? 'You win!' : `${winner.name} wins!`) : 'Game over'}</h2>
      <div className="podium">
        {podium.map((p) => (
          <div key={p.id} className={`podium-spot place-${place(p.id)}`}>
            {place(p.id) === 1 && (
              <span className="crown" aria-hidden="true">
                👑
              </span>
            )}
            <span className="avatar" style={avatarStyle(p.id)}>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="podium-name">{p.id === me ? 'You' : p.name}</span>
            <span className="podium-block">
              <b>{place(p.id)}</b>
              <small>
                {p.hits} card{p.hits === 1 ? '' : 's'}
              </small>
            </span>
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <ol className="party-ranking" start={4}>
          {rest.map((p) => (
            <li key={p.id}>
              <span className="avatar" style={avatarStyle(p.id)}>
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="party-player-name">{p.id === me ? `${p.name} (you)` : p.name}</span>
              <span className="muted small">
                {p.hits} card{p.hits === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ol>
      )}
      {isHost ? (
        <button className="btn primary" onClick={onAgain}>
          Back to lobby
        </button>
      ) : (
        <div className="muted center waiting">
          Waiting for the host
          <span className="dots" />
        </div>
      )}
    </div>
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
 * (from the top, clockwise) with a flickering flame at the burning end.
 */
function RopeRing({ frac }: { frac: number }) {
  const id = useId();
  const R = 44;
  const C = 2 * Math.PI * R;
  // Where the flame sits, in the SVG's 0-100 box.
  const t = frac * 2 * Math.PI;
  const fx = 50 + R * Math.sin(t);
  const fy = 50 - R * Math.cos(t);
  // The SVG overhangs the centre disc by 7% each side (114% wide).
  const at = (v: number) => `${(-7 + v * 1.14).toFixed(2)}%`;
  return (
    <>
      <svg className="rope-ring" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <mask id={`${id}-left`} maskUnits="userSpaceOnUse">
            <circle cx="50" cy="50" r={R} fill="none" stroke="#fff" strokeWidth="9" strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
              transform="rotate(-90 50 50)" />
          </mask>
        </defs>
        <circle className="rope-ring-ash" cx="50" cy="50" r={R} />
        <g mask={`url(#${id}-left)`}>
          <circle className="rope-ring-shadow" cx="50" cy="50" r={R + 0.6} />
          <circle className="rope-ring-cord" cx="50" cy="50" r={R} />
          <circle className="rope-ring-twist" cx="50" cy="50" r={R} />
          <circle className="rope-ring-shine" cx="50" cy="50" r={R - 1.6} />
        </g>
      </svg>
      {frac > 0 && (
        <span className="rope-flame" style={{ left: at(fx), top: at(fy) }}>
          <span className="flame-glow" />
          <span className="flame-core" />
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
      <div className="party-settings">
        <Setting
          label="Lives"
          options={LIVES_OPTIONS}
          value={state.settings.lives}
          disabled={false}
          onPick={(v) => onSettings({ lives: v })}
        />
        <Setting
          label="Seconds per turn"
          options={FUSE_OPTIONS}
          value={state.settings.fuse}
          disabled={false}
          onPick={(v) => onSettings({ fuse: v })}
        />
        <div className="muted small">
          Best with these settings: <b>{best}</b> card{best === 1 ? '' : 's'}
        </div>
      </div>
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
  onAgain,
  onSettings,
}: {
  state: PublicState;
  best: number;
  isNew: boolean;
  onAgain(): void;
  onSettings(): void;
}) {
  const hits = state.players[0]?.hits ?? 0;
  return (
    <div className="panel party-over solo-over">
      <h2>Game over</h2>
      <div className="qf-final">
        <b className="qf-count done">{hits}</b>
        <span className="muted small">card{hits === 1 ? '' : 's'} named</span>
      </div>
      {isNew ? <div className="qf-newbest">New best!</div> : <p className="muted small">Best: {best}</p>}
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
    const on = () => {
      tallest = Math.max(tallest, window.innerHeight, vv.height);
      setOpen(vv.height < tallest * 0.75);
    };
    on();
    vv.addEventListener('resize', on);
    return () => vv.removeEventListener('resize', on);
  }, []);
  return open;
}
