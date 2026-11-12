import type { Card } from '../../../lib/types';
import { ATTR, ATTRS, gradeAttr, pretty, type AttrKey } from '../../../lib/attributes';
import { giveaways } from '../../../lib/cards';
import { newRound } from '../../gauntlet/round';

/**
 * Gauntlet PvP (code name "vs"): 2 to 8 players take turns filling in a
 * card's blank field before their fuse burns out. A wrong answer or a burnt
 * fuse costs a life and passes the same card to the next player to steal. A
 * missed steal costs nothing (everyone sees the answer and a new card comes
 * up); every third successful steal earns a life. The last player standing wins.
 *
 * Only the host runs this. Everyone else gets PublicState snapshots.
 */

export interface PartySettings {
  lives: number;
  /** Seconds per turn. */
  fuse: number;
}
const DEFAULT_PARTY: PartySettings = { lives: 3, fuse: 20 };
export const LIVES_OPTIONS = [1, 2, 3, 5];
export const FUSE_OPTIONS = [15, 20, 30];
/** How many players (inclusive). */
export const VS_MIN_PLAYERS = 2;
export const VS_MAX_PLAYERS = 8;
/** card text takes a while to type, so those turns get this many times the seconds. */
const TEXT_TIME = 2;
/** a steal gets this share of the turn's seconds. */
const STEAL_TIME = 0.5;
/** successful steals for an extra life. */
export const STEALS_FOR_LIFE = 3;

export interface PartyPlayer {
  id: string;
  name: string;
  lives: number;
  connected: boolean;
  /** Cards this player got right this game. */
  hits: number;
  /** Turn number when they went out (0 while still in), for ranking. */
  outAt: number;
  /** This player's right answers in a row (their burnt fuse resets it). */
  streak: number;
  /** Their longest streak this game. */
  bestStreak: number;
  /** cards they stole this game (every STEALS_FOR_LIFE earns a life). */
  steals?: number;
}

export type PartyEvent =
  /** Right answer; `attr` is the field that was blank. */
  | { kind: 'hit'; player: string; cardId: string; streak: number; attr?: AttrKey; stole?: boolean; bonusLife?: boolean; n: number }
  /**
   * A wrong answer (`guess` holds what they said) or a burnt fuse. `example`
   * is the right answer, once the card is done with.
   */
  | {
      kind: 'boom';
      player: string;
      out: boolean;
      example?: string;
      cardId?: string;
      attr?: AttrKey;
      guess?: string;
      /** the card goes to the next player (`to`) to steal (the answer isn't shown yet). */
      passed?: boolean;
      to?: string;
      /** a missed steal, which costs no life. */
      safe?: boolean;
      /** both players missed this card. */
      nobody?: boolean;
      /** nobody got a card's text; this is the real text. */
      reveal?: string;
      n: number;
    }
  | { kind: 'info'; text: string; n: number };

export interface PublicState {
  phase: 'lobby' | 'playing' | 'over';
  players: PartyPlayer[];
  settings: PartySettings;
  /** Whose turn it is. */
  turn: string | null;
  /** This turn's card and its blank field. */
  card: { id: string; hidden: AttrKey; steal: boolean } | null;
  /** the card after this one, so everyone can load its art during this turn. */
  nextCard: string | null;
  /** Milliseconds left on the fuse when this snapshot was sent. */
  fuseLeft: number;
  /** Increases every turn, so clients can restart animations. */
  round: number;
  /** Seconds on this turn's fuse (longer for card text, shorter for a steal). */
  turnSeconds: number;
  last: PartyEvent | null;
  winner: string | null;
  /** Shown in the lobby: how many cards the host's pool has. */
  poolSize: number;
  /** Every card played this game, in order, with `ok` for right or wrong (only sent once the game is over). */
  named: { player: string; cardId: string; ok?: boolean }[];
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export class PartyGame {
  private players: PartyPlayer[] = [];
  private settings: PartySettings = { ...DEFAULT_PARTY };
  private phase: PublicState['phase'] = 'lobby';
  private turn: string | null = null;
  private card: { card: Card; hidden: AttrKey; steal: boolean } | null = null;
  /** picked a turn ahead (see nextCard). */
  private upcoming: { card: Card; hidden: AttrKey } | null = null;
  /** fields with only one possible answer in the pool. */
  private free: Set<string> | null = null;
  private fuseEndsAt = 0;
  private round = 0;
  /** What the current player has typed so far this turn; used if the fuse burns before they submit. */
  private draft: { id: string; round: number; text: string } | null = null;
  private turnSeconds = 0;
  private used = new Set<string>();
  private named: PublicState['named'] = [];
  private last: PartyEvent | null = null;
  private winner: string | null = null;
  private n = 0;

  /** `pool`: the cards to play (the host's card pool); `allowed`: which fields can be blank. */
  constructor(
    private pool: Card[],
    private onChange: (s: PublicState) => void,
    private now: () => number = Date.now,
    private rng: () => number = Math.random,
    private allowed: AttrKey[] = ATTRS.map((a) => a.key),
  ) {}

  state(): PublicState {
    return {
      phase: this.phase,
      players: this.players.map((p) => ({ ...p })),
      settings: { ...this.settings },
      turn: this.turn,
      card: this.card ? { id: this.card.card.id, hidden: this.card.hidden, steal: this.card.steal } : null,
      nextCard: this.phase === 'playing' && this.upcoming ? this.upcoming.card.id : null,
      fuseLeft: this.phase === 'playing' ? Math.max(0, this.fuseEndsAt - this.now()) : 0,
      round: this.round,
      turnSeconds: this.turnSeconds,
      last: this.last,
      winner: this.winner,
      poolSize: this.pool.length,
      named: this.phase === 'over' ? [...this.named] : [],
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
      this.players.push({ id, name, lives: this.phase === 'lobby' ? this.settings.lives : 0, connected: true, hits: 0, outAt: 0, streak: 0, bestStreak: 0, steals: 0 });
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
      if (p.lives > 0) p.outAt = this.round;
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
    const n = this.players.filter((p) => p.connected).length;
    if (n < VS_MIN_PLAYERS || n > VS_MAX_PLAYERS) return;
    this.players = this.players.filter((p) => p.connected);
    for (const p of this.players) {
      p.lives = this.settings.lives;
      p.hits = 0;
      p.outAt = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.steals = 0;
    }
    this.phase = 'playing';
    this.used = new Set();
    this.named = [];
    this.winner = null;
    this.last = null;
    this.turn = null;
    this.upcoming = null;
    this.nextTurn();
    this.emit();
  }

  /** Back to the lobby after a game, keeping everyone who's still here. */
  toLobby() {
    this.phase = 'lobby';
    this.players = this.players.filter((p) => p.connected);
    for (const p of this.players) p.lives = this.settings.lives;
    this.turn = null;
    this.card = null;
    this.emit();
  }

  private alive() {
    return this.players.filter((p) => p.lives > 0 && p.connected);
  }

  /** `stay`: the current player keeps the turn, with a new card (after a missed steal). */
  private nextTurn(stay = false) {
    const alive = this.alive();
    if (!alive.length) return;
    const order = this.players;
    // From the current player (or before the first, at the start of a game).
    const from = order.findIndex((p) => p.id === this.turn);
    let next = alive[0];
    for (let i = stay ? 0 : 1; i <= order.length; i++) {
      const p = order[(from + i + order.length) % order.length];
      if (p.lives > 0 && p.connected) {
        next = p;
        break;
      }
    }
    this.turn = next.id;
    this.free ??= giveaways(this.pool);
    const r = this.upcoming ?? newRound(this.pool, this.allowed, this.rng, this.used, this.free);
    this.card = { card: r.card, hidden: r.hidden, steal: false };
    // Pick the one after now, so its art can load while this card is played.
    this.upcoming = newRound(this.pool, this.allowed, this.rng, new Set([...this.used, r.card.id]), this.free);
    // Card text takes a while to type, so it gets extra time.
    this.turnSeconds = this.settings.fuse * (r.hidden === 'text' ? TEXT_TIME : 1);
    this.fuseEndsAt = this.now() + this.turnSeconds * 1000;
    this.round++;
  }

  /** Game over when one player (or none) is left. */
  private checkOver(): boolean {
    const alive = this.alive();
    if (alive.length <= 1) {
      this.phase = 'over';
      this.winner = alive[0]?.id ?? null;
      this.turn = null;
      this.card = null;
      return true;
    }
    return false;
  }

  /** What a player has typed so far (sent as they type). Graded if their fuse burns out. */
  typing(id: string, text: string) {
    if (this.phase !== 'playing' || this.turn !== id) return;
    this.draft = { id, round: this.round, text };
  }

  /** The current player's unsent answer, if they typed one this turn. */
  private pending(): string {
    const d = this.draft;
    return d && d.id === this.turn && d.round === this.round ? d.text.trim() : '';
  }

  /** A player's typed answer. Returns whether it was right. */
  answer(id: string, text: string): boolean {
    if (this.phase !== 'playing' || this.turn !== id || !this.card) return false;
    return this.answerCard(id, text);
  }

  /**
   * One try. Right passes the turn with a new card. Wrong costs a
   * life and passes the same card to the next player to steal. A right steal
   * moves play on; a missed steal shows the answer and the stealer takes their
   * own turn with a new card (no life lost).
   */
  private answerCard(id: string, text: string): boolean {
    const { card, hidden, steal } = this.card!;
    const g = gradeAttr(hidden, text, card, true);
    const p = this.players.find((x) => x.id === id)!;
    const ok = g.verdict === 'correct';
    if (ok) {
      this.used.add(card.id);
      this.named.push({ player: id, cardId: card.id, ok });
      p.hits++;
      p.streak++;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      let bonusLife = false;
      if (steal) {
        p.steals = (p.steals ?? 0) + 1;
        if (p.steals % STEALS_FOR_LIFE === 0) {
          p.lives++;
          bonusLife = true;
        }
      }
      this.event({ kind: 'hit', player: id, cardId: card.id, streak: p.streak, attr: hidden, stole: steal, bonusLife });
      if (!this.checkOver()) this.nextTurn();
    } else {
      const kind = ATTR[hidden].kind;
      const guess =
        kind === 'text'
          ? `${Math.round((g.score ?? 0) * 100)}% of the key words`
          : kind === 'number'
            ? text.trim() || 'nothing'
            : kind === 'enum'
              ? pretty(hidden, text)
              : text.trim().slice(0, 60) || 'nothing';
      this.missCard(p, guess);
    }
    this.emit();
    return ok;
  }

  /** A wrong answer (`guess`) or a burnt fuse. Steal, or show the answer and move on. */
  private missCard(p: PartyPlayer, guess?: string) {
    const c = this.card!;
    // The next player still in gets a go at this card, unless this was already the steal,
    // or this miss knocks out the second-last player (game over).
    const order = this.players;
    const at = order.findIndex((x) => x.id === p.id);
    let other: PartyPlayer | undefined;
    for (let i = 1; i < order.length; i++) {
      const q = order[(at + i) % order.length];
      if (q.lives > 0 && q.connected) {
        other = q;
        break;
      }
    }
    const othersLeft = this.alive().filter((x) => x.id !== p.id).length;
    const endsGame = p.lives <= 1 && othersLeft <= 1;
    const pass = !c.steal && !!other && !endsGame;
    const final = !pass;
    if (final) {
      this.used.add(c.card.id);
      this.named.push({ player: p.id, cardId: c.card.id, ok: false });
    }
    const extra = {
      cardId: c.card.id,
      attr: c.hidden,
      guess,
      passed: pass,
      to: pass ? other!.id : undefined,
      nobody: final && c.steal,
      example: final ? this.cardTruth() : undefined,
      reveal: final && c.hidden === 'text' ? String(ATTR.text.value(c.card) ?? '') : undefined,
    };
    if (c.steal) {
      // A missed steal costs nothing but the streak.
      p.streak = 0;
      this.event({ kind: 'boom', player: p.id, out: false, safe: true, ...extra });
    } else this.loseLife(p, extra);
    if (this.checkOver()) return;
    if (pass && other) {
      // Same card, new fuse, other player.
      this.turn = other.id;
      this.card = { ...c, steal: true };
      // A steal gets half the turn's time.
      this.turnSeconds = this.turnSeconds * STEAL_TIME;
      this.fuseEndsAt = this.now() + this.turnSeconds * 1000;
      this.round++;
    } else this.nextTurn(c.steal && p.lives > 0 && p.connected);
  }

  /** The right answer to this turn's card, for the event line (not the whole text). */
  private cardTruth(): string | undefined {
    if (!this.card || this.card.hidden === 'text') return undefined;
    return pretty(this.card.hidden, ATTR[this.card.hidden].value(this.card.card));
  }

  private loseLife(p: PartyPlayer, extra: { cardId?: string; attr?: AttrKey; guess?: string; example?: string; passed?: boolean; nobody?: boolean; reveal?: string }) {
    p.lives = Math.max(0, p.lives - 1);
    if (p.lives === 0) p.outAt = this.round;
    p.streak = 0;
    this.event({ kind: 'boom', player: p.id, out: p.lives === 0, ...extra });
  }

  /** Call often (the host ticks it); burns the fuse. */
  tick() {
    if (this.phase !== 'playing' || this.now() < this.fuseEndsAt) return;
    const p = this.players.find((x) => x.id === this.turn);
    // Out of time with an answer typed but not sent: take it as their answer.
    const typed = this.pending();
    this.draft = null;
    if (!p || !this.card) return;
    if (typed) this.answerCard(p.id, typed);
    else {
      this.missCard(p);
      this.emit();
    }
  }
}
