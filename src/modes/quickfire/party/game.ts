import type { Card } from '../../../lib/types';
import { ATTR, ATTRS, gradeAttr, pretty, type AttrKey } from '../../../lib/attributes';
import { giveaways } from '../../../lib/cards';
import { findCard, makePrompt, type Prompt } from '../prompts';
import { newRound } from '../../gauntlet/round';

/**
 * A Quickfire party: players take turns answering prompts before their fuse
 * burns out. Run out of time and you lose a life; the last player standing
 * wins. Each card can be used once per game.
 *
 * Gauntlet VS is the same room with Gauntlet's cards: two players take turns
 * filling in a card's blank field. A wrong answer or a burnt fuse costs a life
 * and passes the same card to the other player to steal. A missed steal costs
 * nothing (everyone sees the answer and a new card comes up); every third
 * successful steal earns a life. The rope gets a little shorter each card.
 *
 * Only the host runs this. Everyone else gets PublicState snapshots.
 */

/** Which game the room plays. */
export type RoomGame = 'quickfire' | 'gauntlet';

export interface PartySettings {
  lives: number;
  /** Seconds per turn. */
  fuse: number;
  game: RoomGame;
}
export const DEFAULT_PARTY: PartySettings = { lives: 3, fuse: 12, game: 'quickfire' };
export const LIVES_OPTIONS = [1, 2, 3, 5];
/** Seconds per turn for each game (Gauntlet answers take longer to fill in). */
export const FUSE_FOR: Record<RoomGame, { options: number[]; default: number }> = {
  quickfire: { options: [8, 12, 20], default: 12 },
  gauntlet: { options: [15, 20, 30], default: 20 },
};
export const FUSE_OPTIONS = FUSE_FOR.quickfire.options;
/** Gauntlet VS is one on one. */
export const VS_PLAYERS = 2;
/** Gauntlet VS: card text takes a while to type, so those turns get this many times the seconds. */
export const TEXT_TIME = 2;
/** Gauntlet VS: successful steals for an extra life. */
export const STEALS_FOR_LIFE = 3;
/**
 * Gauntlet VS: each new card's rope is 3% shorter than the last, down to
 * half the chosen time (never under 6 seconds).
 */
export function vsSeconds(base: number, cardsDealt: number): number {
  const floor = Math.min(base, Math.max(6, base * 0.5));
  return Math.round(Math.max(floor, base * 0.97 ** cardsDealt) * 10) / 10;
}

/** Gauntlet VS cards: the host's card pool and which fields can be blank. */
export interface VsOptions {
  pool: Card[];
  allowed: AttrKey[];
}

export interface PartyPlayer {
  id: string;
  name: string;
  lives: number;
  connected: boolean;
  /** Cards this player named this game. */
  hits: number;
  /** Turn number when they went out (0 while still in), for ranking. */
  outAt: number;
  /** This player's right answers in a row (their burnt fuse resets it). */
  streak: number;
  /** Their longest streak this game. */
  bestStreak: number;
  /** Gauntlet VS: cards they stole this game (every STEALS_FOR_LIFE earns a life). */
  steals?: number;
}

export type PartyEvent =
  /** Right answer. In Gauntlet VS, `attr` is the field that was blank. */
  | { kind: 'hit'; player: string; cardId: string; streak: number; attr?: AttrKey; stole?: boolean; bonusLife?: boolean; n: number }
  | { kind: 'miss'; player: string; text: string; guess: string; n: number }
  /**
   * A life lost: the fuse burnt out, or (Gauntlet VS) a wrong answer, when
   * `guess` holds what they said. `example` is a right answer.
   */
  | {
      kind: 'boom';
      player: string;
      out: boolean;
      example?: string;
      cardId?: string;
      attr?: AttrKey;
      guess?: string;
      /** Gauntlet VS: the card goes to the other player to steal (the answer isn't shown yet). */
      passed?: boolean;
      /** Gauntlet VS: a missed steal, which costs no life. */
      safe?: boolean;
      /** Gauntlet VS: both players missed this card. */
      nobody?: boolean;
      /** Gauntlet VS: nobody got a card's text; this is the real text. */
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
  prompt: { text: string; hint?: string } | null;
  /** Gauntlet VS: this turn's card and its blank field. */
  card: { id: string; hidden: AttrKey; steal: boolean } | null;
  /** Gauntlet VS: the card after this one, so everyone can load its art during this turn. */
  nextCard: string | null;
  /** Milliseconds left on the fuse when this snapshot was sent. */
  fuseLeft: number;
  /** Increases every turn, so clients can restart animations. */
  round: number;
  /** Seconds on this turn's fuse (shorter during a streak). */
  turnSeconds: number;
  /** Right answers in a row, across all players; a burnt fuse resets it. */
  streak: number;
  usedCount: number;
  last: PartyEvent | null;
  winner: string | null;
  /** Shown in the lobby: how many cards the host's pool has. */
  poolSize: number;
  /** Every card named this game, in order (only sent once the game is over). In Gauntlet VS, every card played, with `ok` for right or wrong. */
  named: { player: string; cardId: string; ok?: boolean }[];
}

/**
 * Each right answer in a row takes 8% off the next fuse, down to 40% of the
 * chosen time (but never under 3 seconds). A burnt fuse resets it.
 */
export function turnSeconds(base: number, streak: number): number {
  const floor = Math.min(base, Math.max(3, base * 0.4));
  return Math.round(Math.max(floor, base * 0.92 ** streak) * 10) / 10;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export class PartyGame {
  private players: PartyPlayer[] = [];
  private settings: PartySettings = { ...DEFAULT_PARTY };
  private phase: PublicState['phase'] = 'lobby';
  private turn: string | null = null;
  private prompt: Prompt | null = null;
  private card: { card: Card; hidden: AttrKey; steal: boolean } | null = null;
  /** Gauntlet VS: picked a turn ahead (see nextCard). */
  private upcoming: { card: Card; hidden: AttrKey } | null = null;
  /** Gauntlet VS: fields with only one possible answer in the pool. */
  private free: Set<string> | null = null;
  /** Gauntlet VS: new cards dealt this game (the rope shortens as it grows). */
  private dealt = 0;
  private fuseEndsAt = 0;
  private round = 0;
  private streak = 0;
  private turnSeconds = 0;
  private used = new Set<string>();
  private named: PublicState['named'] = [];
  private last: PartyEvent | null = null;
  private winner: string | null = null;
  private n = 0;

  constructor(
    private pool: Card[],
    private all: Card[],
    private onChange: (s: PublicState) => void,
    private now: () => number = Date.now,
    private rng: () => number = Math.random,
    private vs: VsOptions = { pool, allowed: ATTRS.map((a) => a.key) },
  ) {}

  private get isVs() {
    return this.settings.game === 'gauntlet';
  }

  state(): PublicState {
    return {
      phase: this.phase,
      players: this.players.map((p) => ({ ...p })),
      settings: { ...this.settings },
      turn: this.turn,
      prompt: this.prompt ? { text: this.prompt.text, hint: this.prompt.hint } : null,
      card: this.card ? { id: this.card.card.id, hidden: this.card.hidden, steal: this.card.steal } : null,
      nextCard: this.phase === 'playing' && this.upcoming ? this.upcoming.card.id : null,
      fuseLeft: this.phase === 'playing' ? Math.max(0, this.fuseEndsAt - this.now()) : 0,
      round: this.round,
      turnSeconds: this.turnSeconds,
      streak: this.streak,
      usedCount: this.used.size,
      last: this.last,
      winner: this.winner,
      poolSize: this.isVs ? this.vs.pool.length : this.pool.length,
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
    const next = { ...this.settings, ...s };
    // Switching games: keep the seconds if the new game offers them.
    if (s.game && s.game !== this.settings.game && !s.fuse && !FUSE_FOR[s.game].options.includes(next.fuse)) next.fuse = FUSE_FOR[s.game].default;
    this.settings = next;
    for (const p of this.players) p.lives = this.settings.lives;
    this.emit();
  }

  start() {
    if (this.phase === 'playing' || !this.players.some((p) => p.connected)) return;
    if (this.isVs && this.players.filter((p) => p.connected).length !== VS_PLAYERS) return;
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
    this.streak = 0;
    this.winner = null;
    this.last = null;
    this.turn = null;
    this.upcoming = null;
    this.dealt = 0;
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
    this.card = null;
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
    if (this.isVs) {
      this.free ??= giveaways(this.vs.pool);
      const r = this.upcoming ?? newRound(this.vs.pool, this.vs.allowed, this.rng, this.used, this.free);
      this.card = { card: r.card, hidden: r.hidden, steal: false };
      // Pick the one after now, so its art can load while this card is played.
      this.upcoming = newRound(this.vs.pool, this.vs.allowed, this.rng, new Set([...this.used, r.card.id]), this.free);
      this.prompt = null;
      // No speed-up: filling in a card takes as long as it takes. Card text gets extra time.
      this.turnSeconds = vsSeconds(this.settings.fuse, this.dealt++) * (r.hidden === 'text' ? TEXT_TIME : 1);
    } else {
      this.card = null;
      this.prompt = makePrompt(this.pool, this.used, this.rng);
      this.turnSeconds = turnSeconds(this.settings.fuse, this.streak);
    }
    this.fuseEndsAt = this.now() + this.turnSeconds * 1000;
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
      this.card = null;
      return true;
    }
    return false;
  }

  /** A player's typed answer. Returns whether it was accepted. */
  answer(id: string, text: string): boolean {
    if (this.phase !== 'playing' || this.turn !== id) return false;
    if (this.card) return this.answerCard(id, text);
    if (!this.prompt) return false;
    const prompt = this.prompt;
    const c = findCard(text, this.all, (x) => prompt.test(x) && !this.used.has(x.id));
    let why: string | null = null;
    if (!c) why = `No card called "${text.trim()}"`;
    else if (this.used.has(c.id)) why = `${c.name} was already used`;
    else if (!this.prompt.test(c)) why = `${c.name} ${this.prompt.why(c)}`;
    if (why || !c) {
      this.event({ kind: 'miss', player: id, text: why ?? '', guess: text.trim().slice(0, 60) });
      this.emit();
      return false;
    }
    this.used.add(c.id);
    const p = this.players.find((x) => x.id === id)!;
    p.hits++;
    p.streak++;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    this.named.push({ player: id, cardId: c.id });
    this.streak++;
    this.event({ kind: 'hit', player: id, cardId: c.id, streak: p.streak });
    this.nextTurn();
    this.emit();
    return true;
  }

  /**
   * Gauntlet VS: one try. Right passes the turn with a new card. Wrong costs a
   * life and passes the same card to the other player to steal; a missed steal
   * shows the answer and a new card comes up.
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

  /** Gauntlet VS: a wrong answer (`guess`) or a burnt fuse. Steal, or show the answer and move on. */
  private missCard(p: PartyPlayer, guess?: string) {
    const c = this.card!;
    const other = this.alive().find((x) => x.id !== p.id);
    // The other player gets a go at this card, unless they already had one (or this miss ends the game).
    const pass = !c.steal && !!other && p.lives > 1;
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
      this.fuseEndsAt = this.now() + this.turnSeconds * 1000;
      this.round++;
    } else this.nextTurn();
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
    this.streak = 0;
  }

  /** Call often (the host ticks it); burns the fuse. */
  tick() {
    if (this.phase !== 'playing' || this.now() < this.fuseEndsAt) return;
    const p = this.players.find((x) => x.id === this.turn);
    const example = this.prompt?.answers.find((c) => !this.used.has(c.id))?.name;
    if (p && this.card) {
      this.missCard(p);
      this.emit();
      return;
    }
    if (p) this.loseLife(p, { example });
    if (!this.checkOver()) this.nextTurn();
    this.emit();
  }
}
