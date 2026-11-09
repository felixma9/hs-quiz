import type { Card } from '../../../lib/types';
import { findCard, makePrompt, type Prompt } from '../prompts';

/**
 * A Quickfire party: players take turns answering prompts before their fuse
 * burns out. Run out of time and you lose a life; the last player standing
 * wins. Each card can be used once per game.
 *
 * Only the host runs this. Everyone else gets PublicState snapshots.
 */

export interface PartySettings {
  lives: number;
  /** Seconds per turn. */
  fuse: number;
}
export const DEFAULT_PARTY: PartySettings = { lives: 3, fuse: 12 };
export const LIVES_OPTIONS = [1, 2, 3, 5];
export const FUSE_OPTIONS = [8, 12, 20];

export interface PartyPlayer {
  id: string;
  name: string;
  lives: number;
  connected: boolean;
  /** Cards this player named this game. */
  hits: number;
}

export type PartyEvent =
  | { kind: 'hit'; player: string; cardId: string; n: number }
  | { kind: 'miss'; player: string; text: string; n: number }
  | { kind: 'boom'; player: string; out: boolean; example?: string; n: number }
  | { kind: 'info'; text: string; n: number };

export interface PublicState {
  phase: 'lobby' | 'playing' | 'over';
  players: PartyPlayer[];
  settings: PartySettings;
  /** Whose turn it is. */
  turn: string | null;
  prompt: { text: string; hint?: string } | null;
  /** Milliseconds left on the fuse when this snapshot was sent. */
  fuseLeft: number;
  /** Increases every turn, so clients can restart animations. */
  round: number;
  usedCount: number;
  last: PartyEvent | null;
  winner: string | null;
  /** Shown in the lobby: how many cards the host's pool has. */
  poolSize: number;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export class PartyGame {
  private players: PartyPlayer[] = [];
  private settings: PartySettings = { ...DEFAULT_PARTY };
  private phase: PublicState['phase'] = 'lobby';
  private turn: string | null = null;
  private prompt: Prompt | null = null;
  private fuseEndsAt = 0;
  private round = 0;
  private used = new Set<string>();
  private last: PartyEvent | null = null;
  private winner: string | null = null;
  private n = 0;

  constructor(
    private pool: Card[],
    private all: Card[],
    private onChange: (s: PublicState) => void,
    private now: () => number = Date.now,
    private rng: () => number = Math.random,
  ) {}

  state(): PublicState {
    return {
      phase: this.phase,
      players: this.players.map((p) => ({ ...p })),
      settings: { ...this.settings },
      turn: this.turn,
      prompt: this.prompt ? { text: this.prompt.text, hint: this.prompt.hint } : null,
      fuseLeft: this.phase === 'playing' ? Math.max(0, this.fuseEndsAt - this.now()) : 0,
      round: this.round,
      usedCount: this.used.size,
      last: this.last,
      winner: this.winner,
      poolSize: this.pool.length,
    };
  }

  private emit() {
    this.onChange(this.state());
  }

  private event(e: DistributiveOmit<PartyEvent, 'n'>) {
    this.last = { ...e, n: ++this.n } as PartyEvent;
  }

  addPlayer(id: string, name: string) {
    const existing = this.players.find((p) => p.id === id);
    if (existing) {
      existing.connected = true;
      existing.name = name;
    } else {
      // Late joiners watch until the next game.
      this.players.push({ id, name, lives: this.phase === 'lobby' ? this.settings.lives : 0, connected: true, hits: 0 });
    }
    this.event({ kind: 'info', text: `${name} joined` });
    this.emit();
  }

  removePlayer(id: string) {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    if (this.phase === 'lobby') {
      this.players = this.players.filter((x) => x.id !== id);
    } else {
      p.connected = false;
      p.lives = 0;
    }
    this.event({ kind: 'info', text: `${p.name} left` });
    if (this.phase === 'playing') {
      if (!this.checkOver() && this.turn === id) this.nextTurn();
    }
    this.emit();
  }

  setSettings(s: Partial<PartySettings>) {
    if (this.phase !== 'lobby') return;
    this.settings = { ...this.settings, ...s };
    for (const p of this.players) p.lives = this.settings.lives;
    this.emit();
  }

  start() {
    if (this.phase === 'playing' || !this.players.some((p) => p.connected)) return;
    this.players = this.players.filter((p) => p.connected);
    for (const p of this.players) {
      p.lives = this.settings.lives;
      p.hits = 0;
    }
    this.phase = 'playing';
    this.used = new Set();
    this.winner = null;
    this.last = null;
    this.turn = null;
    this.nextTurn();
    this.emit();
  }

  /** Back to the lobby after a game, keeping everyone who's still here. */
  toLobby() {
    this.phase = 'lobby';
    this.players = this.players.filter((p) => p.connected);
    for (const p of this.players) p.lives = this.settings.lives;
    this.turn = null;
    this.prompt = null;
    this.emit();
  }

  private alive() {
    return this.players.filter((p) => p.lives > 0 && p.connected);
  }

  private nextTurn() {
    const alive = this.alive();
    if (!alive.length) return;
    const order = this.players;
    // From the current player (or before the first, at the start of a game).
    const from = order.findIndex((p) => p.id === this.turn);
    let next = alive[0];
    for (let i = 1; i <= order.length; i++) {
      const p = order[(from + i + order.length) % order.length];
      if (p.lives > 0 && p.connected) {
        next = p;
        break;
      }
    }
    this.turn = next.id;
    this.prompt = makePrompt(this.pool, this.used, this.rng);
    this.fuseEndsAt = this.now() + this.settings.fuse * 1000;
    this.round++;
  }

  /** Game over when one player is left (or none, in a solo game). */
  private checkOver(): boolean {
    const alive = this.alive();
    const multi = this.players.length > 1;
    if ((multi && alive.length <= 1) || alive.length === 0) {
      this.phase = 'over';
      this.winner = multi ? (alive[0]?.id ?? null) : null;
      this.turn = null;
      return true;
    }
    return false;
  }

  /** A player's typed answer. Returns whether it was accepted. */
  answer(id: string, text: string): boolean {
    if (this.phase !== 'playing' || this.turn !== id || !this.prompt) return false;
    const c = findCard(text, this.all);
    const poolIds = new Set(this.pool.map((x) => x.id));
    let why: string | null = null;
    if (!c) why = `No card called "${text.trim()}"`;
    else if (!poolIds.has(c.id)) why = `${c.name} isn't in this room's card pool`;
    else if (this.used.has(c.id)) why = `${c.name} was already used`;
    else if (!this.prompt.test(c)) why = `${c.name} ${this.prompt.why(c)}`;
    if (why || !c) {
      this.event({ kind: 'miss', player: id, text: why ?? '' });
      this.emit();
      return false;
    }
    this.used.add(c.id);
    const p = this.players.find((x) => x.id === id)!;
    p.hits++;
    this.event({ kind: 'hit', player: id, cardId: c.id });
    this.nextTurn();
    this.emit();
    return true;
  }

  /** Call often (the host ticks it); burns the fuse. */
  tick() {
    if (this.phase !== 'playing' || this.now() < this.fuseEndsAt) return;
    const p = this.players.find((x) => x.id === this.turn);
    const example = this.prompt?.answers.find((c) => !this.used.has(c.id))?.name;
    if (p) {
      p.lives = Math.max(0, p.lives - 1);
      this.event({ kind: 'boom', player: p.id, out: p.lives === 0, example });
    }
    if (!this.checkOver()) this.nextTurn();
    this.emit();
  }
}
