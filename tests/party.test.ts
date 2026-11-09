import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PartyGame, type PublicState } from '../src/modes/quickfire/party/game';
import type { Card } from '../src/lib/types';

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
