import Peer, { type DataConnection } from 'peerjs';
import type { PublicState } from './game';

/**
 * Peer-to-peer rooms. The host's browser registers a PeerJS id built from the
 * room code; friends connect to it directly. The free public PeerJS server is
 * only used to introduce the browsers; game traffic goes between them.
 */

/** Messages a guest sends to the host. */
export type ToHost = { t: 'hello'; name: string } | { t: 'answer'; text: string } | { t: 'typing'; text: string };
/** Messages the host sends to guests. */
export type ToGuest =
  | { t: 'state'; state: PublicState }
  | { t: 'typing'; id: string; text: string }
  | { t: 'welcome'; id: string }
  | { t: 'closed' };

const PREFIX = 'hsquiz-room-';

/**
 * Relay (TURN) servers for players who can't connect directly (mobile data,
 * strict routers). PeerJS's own free relays are gone, so we use Metered's.
 * The login comes from .env.local (VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL);
 * it ends up in the page anyway, but stays out of git. Without it, only direct
 * connections work.
 */
const TURN_USER: string | undefined = import.meta.env.VITE_TURN_USERNAME;
const TURN_PASS: string | undefined = import.meta.env.VITE_TURN_CREDENTIAL;
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  ...(TURN_USER && TURN_PASS
    ? [
        {
          urls: [
            'turn:global.relay.metered.ca:80',
            'turn:global.relay.metered.ca:80?transport=tcp',
            'turn:global.relay.metered.ca:443',
            'turns:global.relay.metered.ca:443?transport=tcp',
          ],
          username: TURN_USER,
          credential: TURN_PASS,
        },
      ]
    : []),
];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O

export function newRoomCode(rng = Math.random): string {
  return Array.from({ length: 4 }, () => LETTERS[Math.floor(rng() * LETTERS.length)]).join('');
}
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

export function roomLink(code: string): string {
  return `${location.origin}${location.pathname}#/pvp?room=${code}`;
}
export function roomFromLocation(hash = location.hash): string | null {
  const m = hash.match(/[?&]room=([A-Za-z]{4})/);
  return m ? m[1].toUpperCase() : null;
}

function describeError(e: { type?: string; message?: string }): string {
  switch (e.type) {
    case 'peer-unavailable':
      return "Couldn't find that room. Check the code, or ask the host to keep the page open.";
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return "Couldn't reach the matchmaking server. Check your connection and try again.";
    case 'browser-incompatible':
      return "This browser can't do peer-to-peer games.";
    default:
      return e.message || 'Connection problem';
  }
}

export interface HostRoom {
  code: string;
  /** Send to one guest, or everyone when `to` is omitted. */
  send(msg: ToGuest, to?: string): void;
  close(): void;
}

/** Open a room. Retries with a new code if one is taken. */
export function hostRoom(handlers: {
  onGuestMessage(id: string, msg: ToHost): void;
  onGuestLeft(id: string): void;
  onError(text: string): void;
}): Promise<HostRoom> {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const code = newRoomCode();
      const peer = new Peer(PREFIX + code, { config: { iceServers: ICE_SERVERS } });
      const conns = new Map<string, DataConnection>();
      let opened = false;
      peer.on('open', () => {
        opened = true;
        resolve({
          code,
          send(msg, to) {
            for (const [id, c] of conns) if ((!to || to === id) && c.open) c.send(msg);
          },
          close() {
            for (const c of conns.values()) if (c.open) c.send({ t: 'closed' } satisfies ToGuest);
            setTimeout(() => peer.destroy(), 150);
          },
        });
      });
      peer.on('connection', (conn) => {
        conn.on('open', () => conns.set(conn.peer, conn));
        conn.on('data', (d) => handlers.onGuestMessage(conn.peer, d as ToHost));
        const gone = () => {
          if (conns.delete(conn.peer)) handlers.onGuestLeft(conn.peer);
        };
        conn.on('close', gone);
        conn.on('error', gone);
      });
      peer.on('error', (e) => {
        if (!opened && e.type === 'unavailable-id' && tries++ < 5) {
          peer.destroy();
          attempt();
        } else if (!opened) {
          peer.destroy();
          reject(new Error(describeError(e)));
        } else if (e.type !== 'peer-unavailable') {
          handlers.onError(describeError(e));
        }
      });
      // Keep the room reachable if the signalling socket drops.
      peer.on('disconnected', () => {
        if (!peer.destroyed) peer.reconnect();
      });
    };
    attempt();
  });
}

export interface GuestRoom {
  send(msg: ToHost): void;
  close(): void;
}

/** Join a friend's room by code. */
export function joinRoom(
  code: string,
  name: string,
  handlers: { onMessage(msg: ToGuest): void; onClosed(text: string): void },
): Promise<GuestRoom> {
  return new Promise((resolve, reject) => {
    const peer = new Peer({ config: { iceServers: ICE_SERVERS } });
    let joined = false;
    let done = false;
    // Destroying the peer closes the connection, which would call this again
    // (and replace "The host closed the room." with "Lost connection"), so only the first reason counts.
    const fail = (text: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      peer.destroy();
      if (joined) handlers.onClosed(text);
      else reject(new Error(text));
    };
    const timer = setTimeout(() => !joined && fail("Found the room but couldn't connect to the host. Try again, or join the same Wi-Fi."), 15000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => {
        joined = true;
        clearTimeout(timer);
        conn.send({ t: 'hello', name } satisfies ToHost);
        resolve({
          send: (m) => conn.open && conn.send(m),
          close: () => {
            done = true;
            peer.destroy();
          },
        });
      });
      conn.on('data', (d) => {
        const msg = d as ToGuest;
        if (msg.t === 'closed') fail('The host closed the room.');
        else handlers.onMessage(msg);
      });
      conn.on('close', () => joined && fail('Lost connection to the host.'));
    });
    peer.on('error', (e) => fail(describeError(e)));
  });
}
