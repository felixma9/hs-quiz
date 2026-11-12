import { FILLER, levenshtein, matchWords, normalizeName, words } from './fuzzy';

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

export const TEXT_PASS = 0.7;
export const TEXT_CLOSE = 0.4;
/** Gauntlet VS (against the rope): share of the card's key words you need. */
export const TEXT_PASS_LENIENT = 0.5;

export function gradeNumber(guess: number | null, truth: number | null): Grade {
  if (guess === truth) return { verdict: 'correct' };
  if (guess === null || truth === null) return { verdict: 'wrong' };
  const arrow = truth > guess ? 'up' : 'down';
  return { verdict: Math.abs(truth - guess) <= 1 ? 'close' : 'wrong', arrow };
}

/** Enum values may be combos like "BEAST + UNDEAD"; overlap counts as close. */
export function gradeEnum(guess: string, truth: string): Grade {
  if (guess === truth) return { verdict: 'correct' };
  const g = guess.split(' + ');
  const t = truth.split(' + ');
  // The same classes (or tribes) in another order still match.
  if (g.length === t.length && g.every((x) => t.includes(x))) return { verdict: 'correct' };
  if (g.some((x) => x !== 'NONE' && t.includes(x))) return { verdict: 'close' };
  return { verdict: 'wrong' };
}

/** How many typos a name of this length allows. */
export function nameTolerance(len: number): number {
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
 * Free-typed card text, graded on meaning rather than exact wording:
 * filler words ("a", "the", "your"...) don't count, words can be in any
 * order, number words equal digits, and small typos and plurals are fine.
 * Score = meaningful words matched / meaningful words in the longer of the
 * two texts. The numbers must all be there (in any order) for a pass.
 */
export function gradeText(guess: string, truth: string, lenient = false): Grade {
  const tw = words(truth);
  const gw = words(guess);
  if (!tw.length) return { verdict: gw.length ? 'wrong' : 'correct', score: gw.length ? 0 : 1, truthMatched: [] };
  if (!gw.length) return { verdict: 'wrong', score: 0, truthMatched: tw.map(() => false) };

  const { inTruth, usedGuess: hitInGuess } = matchWords(tw, gw);
  const meaningful = (w: string) => !FILLER.has(w);
  // If a text is all filler (unlikely), count every word.
  const tKeep = tw.some(meaningful) ? meaningful : () => true;
  const gKeep = gw.some(meaningful) ? meaningful : () => true;
  const matched = tw.filter((w, i) => tKeep(w) && inTruth[i]).length;
  const tCount = tw.filter(tKeep).length;
  const gCount = gw.filter(gKeep).length;
  if (lenient) {
    // Against the rope: score is the share of the card's key words you got (in any order);
    // extra words and wrong numbers are fine. Just don't pad the answer with every
    // keyword you can think of: at least a quarter of your words have to be on the card.
    const recall = matched / tCount;
    const hits = gw.filter((w, i) => gKeep(w) && hitInGuess[i]).length;
    const precise = hits / Math.max(1, gCount) >= 0.25;
    return { verdict: recall >= TEXT_PASS_LENIENT && precise ? 'correct' : recall >= TEXT_CLOSE / 2 ? 'close' : 'wrong', score: recall, truthMatched: inTruth };
  }
  const score = matched / Math.max(tCount, gCount);

  const isNum = (w: string) => /^\d+$/.test(w);
  const sorted = (ws: string[]) => ws.filter(isNum).sort().join(',');
  const numsOk = sorted(tw) === sorted(gw);
  const verdict: Verdict = score >= TEXT_PASS && numsOk ? 'correct' : score >= TEXT_CLOSE ? 'close' : 'wrong';
  return { verdict, score, truthMatched: inTruth };
}
