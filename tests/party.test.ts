import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PartyGame, type PublicState } from '../src/modes/quickfire/party/game';
import type { Card } from '../src/lib/types';
import { ATTR } from '../src/lib/attributes';

const all: Card[] = JSON.parse(readFileSync('public/cards.json', 'utf8')).filter((c: Card) => c.type !== 'LOCATION');

function setup(names = ['A', 'B', 'C']) {
  let t = 0;
  let last!: PublicState;
  const g = new PartyGame(all, all, (s) => (last = s), () => t);
  names.forEach((n) => g.addPlayer(n, n));
  return { g, state: () => last, advance: (ms: number) => ((t += ms), g.tick()) };
}

/** Find a card that answers the current prompt and hasn't been used. */
function solve(g: PartyGame): string {
  const p = (g as unknown as { prompt: { answers: Card[] }; used: Set<string> });
  return p.prompt.answers.find((c) => !p.used.has(c.id))!.name;
}

describe('quickfire party', () => {
  it('passes the turn on a right answer and keeps it on a wrong one', () => {
    const { g, state } = setup();
    g.start();
    expect(state().turn).toBe('A');
    expect(g.answer('B', 'Wisp')).toBe(false); // not B's turn
    expect(g.answer('A', 'definitely not a card')).toBe(false);
    expect(state().turn).toBe('A');
    expect(state().last?.kind).toBe('miss');
    expect(g.answer('A', solve(g))).toBe(true);
    expect(state().turn).toBe('B');
    expect(state().players[0].hits).toBe(1);
  });

  it("won't take the same card twice", () => {
    const { g, state } = setup(['A', 'B']);
    g.start();
    const name = solve(g);
    g.answer('A', name);
    // Force a prompt the used card fits by checking the message.
    g.answer('B', name);
    expect(state().last).toMatchObject({ kind: 'miss' });
  });

  it('burns a life when the fuse runs out and ends with one player left', () => {
    const { g, state, advance } = setup(['A', 'B']);
    g.setSettings({ lives: 1, fuse: 8 });
    g.start();
    advance(7999);
    expect(state().phase).toBe('playing');
    advance(2);
    expect(state().last).toMatchObject({ kind: 'boom', player: 'A', out: true });
    expect(state().phase).toBe('over');
    expect(state().winner).toBe('B');
  });

  it('skips eliminated players and players who leave', () => {
    const { g, state, advance } = setup(['A', 'B', 'C']);
    g.setSettings({ lives: 1, fuse: 8 });
    g.start();
    advance(8001); // A is out
    expect(state().turn).toBe('B');
    g.removePlayer('B'); // B leaves on their turn: C is the last one standing
    expect(state().phase).toBe('over');
    expect(state().winner).toBe('C');
  });

  it('back to the lobby resets lives', () => {
    const { g, state, advance } = setup(['A', 'B']);
    g.setSettings({ lives: 2 });
    g.start();
    advance(13000);
    expect(state().players[0].lives).toBe(1);
    g.toLobby();
    expect(state().phase).toBe('lobby');
    expect(state().players.every((p) => p.lives === 2)).toBe(true);
  });
});

describe('quickfire party ranking', () => {
  it('records when each player went out', () => {
    let t = 0;
    let last!: PublicState;
    const g = new PartyGame(all, all, (s) => (last = s), () => t);
    ['A', 'B', 'C'].forEach((n) => g.addPlayer(n, n));
    g.setSettings({ lives: 1, fuse: 8 });
    g.start();
    t += 8001; g.tick(); // A out first
    t += 8001; g.tick(); // then B
    const [a, b] = last.players;
    expect(a.outAt).toBeGreaterThan(0);
    expect(b.outAt).toBeGreaterThan(a.outAt);
    expect(last.winner).toBe('C');
  });
});

describe('quickfire party speed-up', () => {
  it('shortens the fuse on a streak and resets on a burnt fuse', async () => {
    const { turnSeconds } = await import('../src/modes/quickfire/party/game');
    expect(turnSeconds(12, 0)).toBe(12);
    expect(turnSeconds(12, 3)).toBeLessThan(12);
    expect(turnSeconds(12, 50)).toBe(4.8); // floor: 40%
    expect(turnSeconds(8, 50)).toBe(3.2);
    let t = 0;
    let last!: PublicState;
    const g = new PartyGame(all, all, (s) => (last = s), () => t);
    ['A', 'B'].forEach((n) => g.addPlayer(n, n));
    g.setSettings({ fuse: 12, lives: 3 });
    g.start();
    g.answer('A', solve(g));
    g.answer('B', solve(g));
    expect(last.streak).toBe(2);
    expect(last.turnSeconds).toBeLessThan(12);
    t += last.turnSeconds * 1000 + 1;
    g.tick();
    expect(last.streak).toBe(0);
    expect(last.turnSeconds).toBe(12);
  });
});

describe('quickfire party hot streaks', () => {
  it("counts each player's own run and resets it when their fuse burns", () => {
    let t = 0;
    let last!: PublicState;
    const g = new PartyGame(all, all, (s) => (last = s), () => t);
    ['A', 'B'].forEach((n) => g.addPlayer(n, n));
    g.setSettings({ fuse: 12, lives: 3 });
    g.start();
    g.answer('A', solve(g)); // A 1
    g.answer('B', solve(g)); // B 1
    g.answer('A', solve(g)); // A 2
    expect(last.players.find((p) => p.id === 'A')!.streak).toBe(2);
    expect(last.last).toMatchObject({ kind: 'hit', player: 'A', streak: 2 });
    t += 60_000;
    g.tick(); // B burns
    expect(last.players.find((p) => p.id === 'B')!.streak).toBe(0);
    expect(last.players.find((p) => p.id === 'A')!.streak).toBe(2);
  });
});

describe('quickfire party results', () => {
  it('keeps each best streak and the cards named, sent once the game is over', () => {
    let t = 0;
    let last!: PublicState;
    const g = new PartyGame(all, all, (s) => (last = s), () => t);
    ['A', 'B'].forEach((n) => g.addPlayer(n, n));
    g.setSettings({ fuse: 12, lives: 1 });
    g.start();
    g.answer('A', solve(g));
    g.answer('B', solve(g));
    g.answer('A', solve(g));
    expect(last.named).toEqual([]); // not sent mid-game
    t += 60_000;
    g.tick(); // B burns out: A wins
    expect(last.phase).toBe('over');
    expect(last.named.map((x) => x.player)).toEqual(['A', 'B', 'A']);
    expect(last.players.find((p) => p.id === 'A')!.bestStreak).toBe(2);
    expect(last.players.find((p) => p.id === 'B')!.bestStreak).toBe(1);
  });
});

describe('gauntlet vs', () => {
  const vsSetup = (names = ['A', 'B']) => {
    const s = setup(names);
    s.g.setSettings({ game: 'gauntlet' });
    return s;
  };
  /** The right answer to the current card, as a form would send it. */
  const truth = (_g: PartyGame, s: PublicState) => String(ATTR[s.card!.hidden].value(all.find((x) => x.id === s.card!.id)!) ?? '');

  it('needs 2 to 8 players, with longer turns', () => {
    const solo = vsSetup(['A']);
    solo.g.start();
    expect(solo.state().phase).toBe('lobby');
    const { g, state } = vsSetup(['A', 'B', 'C']);
    expect(state().settings.fuse).toBe(20);
    g.start();
    expect(state().phase).toBe('playing');
    expect(state().card).toBeTruthy();
    expect(state().prompt).toBeNull();
  });

  it('with 3+ players, a miss passes to the next player to steal, then play moves on', () => {
    const { g, state } = vsSetup(['A', 'B', 'C']);
    g.start();
    expect(state().turn).toBe('A');
    g.answer('A', 'zzzz wrong');
    expect(state().last).toMatchObject({ kind: 'boom', player: 'A', passed: true, to: 'B' });
    expect(state().turn).toBe('B');
    g.answer('B', 'zzzz wrong');
    expect(state().last).toMatchObject({ kind: 'boom', player: 'B', safe: true, nobody: true });
    // A missed steal: the stealer takes their own turn with a new card.
    expect(state().turn).toBe('B');
    expect(state().card!.steal).toBe(false);
    expect(state().players[1].lives).toBe(3);
  });

  it('with 3+ players, a right steal moves play on to the player after the stealer', () => {
    const { g, state } = vsSetup(['A', 'B', 'C']);
    g.start();
    g.answer('A', 'zzzz wrong');
    const s = state();
    const truth = String(ATTR[s.card!.hidden].value(all.find((x) => x.id === s.card!.id)!) ?? '');
    expect(g.answer('B', truth)).toBe(true);
    expect(state().turn).toBe('C');
    expect(state().card!.steal).toBe(false);
  });

  it('keeps going when a player is knocked out with 2+ left', () => {
    const { g, state } = vsSetup(['A', 'B', 'C']);
    g.setSettings({ lives: 1 });
    g.start();
    g.answer('A', 'zzzz wrong');
    expect(state().phase).toBe('playing');
    expect(state().players[0].lives).toBe(0);
    expect(state().last).toMatchObject({ out: true, passed: true, to: 'B' });
  });

  it('passes the turn on a right answer, and costs a life on a wrong one', () => {
    const { g, state } = vsSetup();
    g.start();
    expect(state().turn).toBe('A');
    const first = state().card!;
    expect(g.answer('A', truth(g, state()))).toBe(true);
    // No pause: the next card comes straight up.
    expect(state().card!.id).not.toBe(first.id);
    expect(state().last).toMatchObject({ kind: 'hit', player: 'A' });
    expect(state().turn).toBe('B');
    expect(g.answer('B', 'zzzz wrong')).toBe(false);
    expect(state().last).toMatchObject({ kind: 'boom', player: 'B', guess: expect.any(String) });
    expect(state().players[1].lives).toBe(2);
    expect(state().turn).toBe('A');
  });

  it('burns a life on time out and lists every card played at the end', () => {
    const { g, state, advance } = vsSetup();
    g.setSettings({ lives: 1 });
    g.start();
    g.answer('A', truth(g, state()));
    advance(state().turnSeconds * 1000 + 1);
    expect(state().phase).toBe('over');
    expect(state().winner).toBe('A');
    expect(state().named.map((x) => [x.player, x.ok])).toEqual([
      ['A', true],
      ['B', false],
    ]);
  });
});

describe('gauntlet vs text turns', () => {
  it('get double time', () => {
    let last!: PublicState;
    const textCards = all.filter((c) => c.type === 'MINION' && c.text);
    const g = new PartyGame(all, all, (s) => (last = s), () => 0, Math.random, { pool: textCards, allowed: ['text'] });
    g.addPlayer('A', 'A');
    g.addPlayer('B', 'B');
    g.setSettings({ game: 'gauntlet', fuse: 20 });
    g.start();
    expect(last.card?.hidden).toBe('text');
    expect(last.turnSeconds).toBe(40);
  });
});

describe('gauntlet vs steals', () => {
  const vs = () => {
    let t = 0;
    let last!: PublicState;
    const g = new PartyGame(all, all, (s) => (last = s), () => t);
    g.addPlayer('A', 'A');
    g.addPlayer('B', 'B');
    g.setSettings({ game: 'gauntlet', lives: 3 });
    g.start();
    return { g, state: () => last, advance: (ms: number) => ((t += ms), g.tick()) };
  };

  it('passes a missed card to the other player, then shows the answer if they miss too', () => {
    const { g, state } = vs();
    const card = state().card!.id;
    g.answer('A', 'zzzz wrong');
    expect(state().last).toMatchObject({ kind: 'boom', player: 'A', passed: true, example: undefined });
    expect(state().turn).toBe('B');
    expect(state().card).toMatchObject({ id: card, steal: true });
    g.answer('B', 'zzzz wrong');
    expect(state().last).toMatchObject({ kind: 'boom', player: 'B', passed: false, nobody: true });
    // A missed steal costs no life.
    expect(state().last).toMatchObject({ safe: true });
    expect(state().players[1].lives).toBe(3);
    expect(state().players[0].lives).toBe(2);
    expect(state().card!.id).not.toBe(card);
    expect(state().card!.steal).toBe(false);
    expect(state().turn).toBe('B');
  });

  it('gives a steal half the time, and the next card full time again', () => {
    const { g, state } = vs();
    const full = state().turnSeconds;
    g.answer('A', 'zzzz wrong');
    expect(state().card!.steal).toBe(true);
    expect(state().turnSeconds).toBe(full * 0.5);
    g.answer('B', 'zzzz wrong');
    expect(state().card!.steal).toBe(false);
    expect([20, 40]).toContain(state().turnSeconds);
  });

  it('passes on a burnt rope too, and a steal can win the card', () => {
    const { g, state, advance } = vs();
    advance(state().turnSeconds * 1000 + 1);
    expect(state().last).toMatchObject({ player: 'A', passed: true });
    const s = state();
    const truth = String(ATTR[s.card!.hidden].value(all.find((x) => x.id === s.card!.id)!) ?? '');
    expect(g.answer('B', truth)).toBe(true);
    expect(state().players[1].hits).toBe(1);
    expect(state().card!.steal).toBe(false);
  });
});

describe('gauntlet vs next card', () => {
  it('announces the next card a turn ahead, then deals it', () => {
    let last!: PublicState;
    const g = new PartyGame(all, all, (s) => (last = s));
    g.addPlayer('A', 'A');
    g.addPlayer('B', 'B');
    g.setSettings({ game: 'gauntlet' });
    g.start();
    const next = last.nextCard;
    expect(next).toBeTruthy();
    expect(next).not.toBe(last.card!.id);
    const truth = String(ATTR[last.card!.hidden].value(all.find((x) => x.id === last.card!.id)!) ?? '');
    g.answer('A', truth);
    expect(last.card!.id).toBe(next);
  });
});

describe('gauntlet vs rewards and pace', () => {
  it('gives a life for every third steal', () => {
    let t = 0;
    let last!: PublicState;
    const g = new PartyGame(all, all, (s) => (last = s), () => t);
    g.addPlayer('A', 'A');
    g.addPlayer('B', 'B');
    g.setSettings({ game: 'gauntlet', lives: 5 });
    g.start();
    const truth = () => String(ATTR[last.card!.hidden].value(all.find((x) => x.id === last.card!.id)!) ?? '');
    for (let i = 0; i < 3; i++) {
      // Whoever's up misses; B steals. Then A's card (or B's) moves on.
      while (last.turn !== 'A') g.answer(last.turn!, truth());
      g.answer('A', 'zzzz wrong');
      expect(last.turn).toBe('B');
      g.answer('B', truth());
      expect(last.last).toMatchObject({ kind: 'hit', stole: true, bonusLife: i === 2 });
    }
    expect(last.players[1].steals).toBe(3);
    expect(last.players[1].lives).toBe(6);
  });

});
