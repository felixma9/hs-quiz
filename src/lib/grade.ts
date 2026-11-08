import { lcsWords, levenshtein, normalizeName, words } from './fuzzy';

export type Verdict = 'correct' | 'close' | 'wrong';

export interface Grade {
  verdict: Verdict;
  /** For numbers: which way the real value is from the guess. */
  arrow?: 'up' | 'down';
  /** For text: 0..1 similarity. */
  score?: number;
  /** For text: which words of the real text the guess got (in order). */
  truthMatched?: boolean[];
}

export const TEXT_PASS = 0.85;
export const TEXT_CLOSE = 0.5;

export function gradeNumber(guess: number | null, truth: number | null): Grade {
  if (guess === truth) return { verdict: 'correct' };
  if (guess === null || truth === null) return { verdict: 'wrong' };
  const arrow = truth > guess ? 'up' : 'down';
  return { verdict: Math.abs(truth - guess) <= 1 ? 'close' : 'wrong', arrow };
}

/** Enum values may be combos like "BEAST + UNDEAD"; overlap counts as close. */
export function gradeEnum(guess: string, truth: string, sameGroup?: (a: string, b: string) => boolean): Grade {
  if (guess === truth) return { verdict: 'correct' };
  const g = guess.split(' + ');
  const t = truth.split(' + ');
  if (g.some((x) => x !== 'NONE' && t.includes(x))) return { verdict: 'close' };
  if (sameGroup && guess && sameGroup(guess, truth)) return { verdict: 'close' };
  return { verdict: 'wrong' };
}

/** How many typos a name of this length allows. */
function nameTolerance(len: number): number {
  if (len <= 4) return 0;
  if (len <= 8) return 1;
  return 2;
}

export function gradeName(guess: string, truth: string): Grade {
  const g = normalizeName(guess);
  const t = normalizeName(truth);
  if (!g) return { verdict: 'wrong' };
  return { verdict: levenshtein(g, t) <= nameTolerance(t.length) ? 'correct' : 'wrong' };
}

/**
 * Free-typed card text. Score is the share of words in the right order;
 * the numbers must match exactly, since they matter most on a card.
 */
export function gradeText(guess: string, truth: string): Grade {
  const tw = words(truth);
  const gw = words(guess);
  if (!tw.length) return { verdict: gw.length ? 'wrong' : 'correct', score: gw.length ? 0 : 1, truthMatched: [] };
  if (!gw.length) return { verdict: 'wrong', score: 0, truthMatched: tw.map(() => false) };
  const { length, inA } = lcsWords(tw, gw);
  const score = length / Math.max(tw.length, gw.length);
  const isNum = (w: string) => /^\d+$/.test(w);
  const numsOk = tw.filter(isNum).join(',') === gw.filter(isNum).join(',');
  const verdict: Verdict = score >= TEXT_PASS && numsOk ? 'correct' : score >= TEXT_CLOSE ? 'close' : 'wrong';
  return { verdict, score, truthMatched: inA };
}
