import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../../../lib/types';
import { Art, useArtCrop } from '../../hsdle/Art';
import { Bold } from '../Solo';
import { FUSE_OPTIONS, LIVES_OPTIONS, PartyGame, type PartySettings, type PublicState } from './game';
import { hostRoom, joinRoom, roomLink, type GuestRoom, type HostRoom } from './net';

const HOST_ID = 'host';

export type PartyMode = { role: 'host' } | { role: 'guest'; code: string };

interface Props {
  mode: PartyMode;
  name: string;
  /** The host's card pool (ignored for guests: the host's pool is used). */
  pool: Card[];
  all: Card[];
  onLeave(): void;
}

/** A Quickfire room: connection, then lobby / game / results for everyone. */
export function Party({ mode, name, pool, all, onLeave }: Props) {
  const [state, setState] = useState<PublicState | null>(null);
  const [me, setMe] = useState<string | null>(mode.role === 'host' ? HOST_ID : null);
  const [code, setCode] = useState(mode.role === 'guest' ? mode.code : '');
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState<{ id: string; text: string } | null>(null);
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
    joinRoom(mode.code, name, {
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
    if (mode.role === 'host') game.current?.answer(HOST_ID, text);
    else guest.current?.send({ t: 'answer', text });
  };
  const sendTyping = (text: string) => {
    if (mode.role === 'host') host.current?.send({ t: 'typing', id: HOST_ID, text: text.slice(0, 60) });
    else guest.current?.send({ t: 'typing', text });
  };

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
  return (
    <div className="mode party">
      {state.phase === 'lobby' && (
        <Lobby state={state} code={code} me={me} isHost={isHost} onSettings={(s) => game.current?.setSettings(s)} onStart={() => game.current?.start()} />
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
              <span className="avatar" style={{ background: colorFor(p.id) }}>
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
        <Setting label="Lives" options={LIVES_OPTIONS} value={state.settings.lives} disabled={!isHost} onPick={(v) => onSettings({ lives: v })} />
        <Setting label="Seconds per turn" options={FUSE_OPTIONS} value={state.settings.fuse} disabled={!isHost} onPick={(v) => onSettings({ fuse: v })} />
        <div className="muted small">Cards come from the host's card pool ({state.poolSize.toLocaleString()} cards).</div>
      </div>

      {isHost ? (
        <button className="btn primary" onClick={onStart}>
          {state.players.length > 1 ? 'Start game' : 'Start (just you)'}
        </button>
      ) : (
        <div className="muted center waiting">Waiting for the host to start…</div>
      )}
    </>
  );
}

function Setting({ label, options, value, disabled, onPick }: { label: string; options: number[]; value: number; disabled: boolean; onPick(v: number): void }) {
  return (
    <div className="setting">
      <span>{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={o === value} className={o === value ? 'on' : ''} disabled={disabled} onClick={() => onPick(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Game ---------------- */

function Play({
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
  typing: { id: string; text: string } | null;
  all: Card[];
  onAnswer(text: string): void;
  onTyping(text: string): void;
}) {
  const crop = useArtCrop();
  const [input, setInput] = useState('');
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
    if (myTurn) field.current?.focus();
  }, [state.round, myTurn]);

  // Shake my box when the host rejects my answer.
  const last = state.last;
  useEffect(() => {
    if (last?.kind === 'miss' && last.player === me && field.current) {
      const el = field.current;
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
  }, [last, me]);

  const left = Math.max(0, deadline - now) / 1000;
  const frac = Math.min(1, left / state.settings.fuse);
  const urgent = left <= 3;
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? 'Someone';
  const typed = typing && typing.id === state.turn ? typing.text : '';

  return (
    <>
      <div className="party-ring">
        {state.players.map((p) => (
          <div
            key={p.id + (last?.kind === 'boom' && last.player === p.id ? `-boom-${last.n}` : '')}
            className={`ring-player ${p.id === state.turn ? 'active' : ''} ${p.lives === 0 ? 'out' : ''} ${last?.kind === 'boom' && last.player === p.id ? 'boom' : ''}`}
          >
            <span className="avatar" style={{ background: colorFor(p.id) }}>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="ring-name">{p.id === me ? 'You' : p.name}</span>
            <span className="ring-lives" aria-label={`${p.lives} lives`}>
              {p.lives > 0 ? '♥'.repeat(p.lives) : 'out'}
            </span>
          </div>
        ))}
      </div>

      <div className={`fuse ${urgent ? 'urgent' : ''}`} aria-label={`${Math.ceil(left)} seconds left`}>
        <span className="fuse-track">
          <span className="fuse-burn" style={{ transform: `scaleX(${frac})` }} />
          <span className="fuse-spark" style={{ left: `${frac * 100}%` }} />
        </span>
        <span className="fuse-num">{Math.ceil(left)}</span>
      </div>

      <div className={`qf-prompt party-prompt ${myTurn ? 'mine' : ''}`} key={state.round}>
        <div className="turn-label">{myTurn ? 'Your turn!' : `${current?.name ?? '…'}'s turn`}</div>
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
            className="in qf-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
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
      ) : (
        <div className="watch-typing" aria-live="off">
          {typed ? <span>{typed}</span> : <span className="muted">{current?.name ?? 'They'} is thinking…</span>}
          <span className="caret" />
        </div>
      )}

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
  const ranked = [...state.players].sort((a, b) => b.lives - a.lives || b.hits - a.hits);
  return (
    <div className="panel party-over">
      <div className="trophy" aria-hidden="true">
        🏆
      </div>
      <h2>{winner ? (winner.id === me ? 'You win!' : `${winner.name} wins!`) : 'Game over'}</h2>
      <ol className="party-ranking">
        {ranked.map((p) => (
          <li key={p.id} className={p.id === state.winner ? 'winner' : ''}>
            <span className="avatar" style={{ background: colorFor(p.id) }}>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="party-player-name">{p.id === me ? `${p.name} (you)` : p.name}</span>
            <span className="muted small">
              {p.hits} card{p.hits === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ol>
      {isHost ? (
        <button className="btn primary" onClick={onAgain}>
          Back to lobby
        </button>
      ) : (
        <div className="muted center waiting">Waiting for the host…</div>
      )}
    </div>
  );
}

/** A stable color per player id. */
function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}
