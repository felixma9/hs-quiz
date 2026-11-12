import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PartyGame, type PublicState } from '../src/modes/pvp/party/game';
import type { Card } from '../src/lib/types';
import { ATTR } from '../src/lib/attributes';

const all: Card[] = JSON.parse(readFileSync('public/cards.json', 'utf8')).filter((c: Card) => c.type !== 'LOCATION');

function setup(names = ['A', 'B', 'C']) {
  let t = 0;
  let last!: PublicState;
  const g = new PartyGame(all, (s) => (last = s), () => t);
  names.forEach((n) => g.addPlayer(n, n));
  return { g, state: () => last, advance: (ms: number) => ((t += ms), g.tick()) };
}

describe('gauntlet vs', () => {
  const vsSetup = (names = ['A', 'B']) => setup(names);
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
    const g = new PartyGame(textCards, (s) => (last = s), () => 0, Math.random, ['text']);
    g.addPlayer('A', 'A');
    g.addPlayer('B', 'B');
    g.setSettings({ fuse: 20 });
    g.start();
    expect(last.card?.hidden).toBe('text');
    expect(last.turnSeconds).toBe(40);
  });
});

describe('gauntlet vs steals', () => {
  const vs = () => {
    let t = 0;
    let last!: PublicState;
    const g = new PartyGame(all, (s) => (last = s), () => t);
    g.addPlayer('A', 'A');
    g.addPlayer('B', 'B');
    g.setSettings({ lives: 3 });
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

  it('takes the typed answer when the rope burns before they submit', () => {
    const { g, state, advance } = vs();
    const s = state();
    const truth = String(ATTR[s.card!.hidden].value(all.find((x) => x.id === s.card!.id)!) ?? '');
    g.typing('A', truth);
    advance(s.turnSeconds * 1000 + 1);
    expect(state().last).toMatchObject({ kind: 'hit', player: 'A' });
    expect(state().players[0].lives).toBe(3);
  });

  it('grades a wrong typed answer as a wrong answer, and ignores typing from last turn', () => {
    const { g, state, advance } = vs();
    g.typing('A', 'zzzz wrong');
    advance(state().turnSeconds * 1000 + 1);
    expect(state().last).toMatchObject({ kind: 'boom', player: 'A', guess: expect.any(String), passed: true });
    // B hasn't typed this turn: a plain time-out.
    g.typing('A', 'old');
    advance(state().turnSeconds * 1000 + 1);
    expect(state().last).toMatchObject({ kind: 'boom', player: 'B', guess: undefined });
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
    const g = new PartyGame(all, (s) => (last = s));
    g.addPlayer('A', 'A');
    g.addPlayer('B', 'B');
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
    const g = new PartyGame(all, (s) => (last = s), () => t);
    g.addPlayer('A', 'A');
    g.addPlayer('B', 'B');
    g.setSettings({ lives: 5 });
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
