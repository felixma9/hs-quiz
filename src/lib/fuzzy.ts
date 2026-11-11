/** Lowercase, drop accents, keep only letters and digits. "Al'Akir the Windlord" -> "alakirthewindlord". */
export function normalizeName(s: string): string {
  return cachedNorm.get(s) ?? normalize(s);
}

/**
 * Card names get normalized on every keystroke of a search, over thousands of
 * cards, so names are remembered once normalized (typed input isn't, so the cache stays the size of the card list).
 */
const cachedNorm = new Map<string, string>();
export function normalizeCardName(name: string): string {
  let n = cachedNorm.get(name);
  if (n === undefined) {
    n = normalize(name);
    cachedNorm.set(name, n);
  }
  return n;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
  once: '1', twice: '2', first: '1', second: '2', third: '3', fourth: '4', fifth: '5',
  '1st': '1', '2nd': '2', '3rd': '3', '4th': '4', '5th': '5',
};

/** Shorthand people type for card text ("ur" = "your", "dmg" = "damage", "eot" = "end of turn"). */
const ABBREVIATIONS: Record<string, string> = {
  u: 'you', ur: 'your', urs: 'yours', yr: 'your', w: 'with', wo: 'without', b4: 'before', thru: 'through', til: 'until',
  dmg: 'damage', dmgs: 'damage', atk: 'attack', att: 'attack', hp: 'health', def: 'health', hlth: 'health',
  opp: 'opponent', opps: 'opponents', oppo: 'opponent', enemys: 'enemy', frnd: 'friendly', fr: 'friendly',
  min: 'minion', mins: 'minions', minn: 'minion', char: 'character', chars: 'characters', crd: 'card', crds: 'cards',
  rnd: 'random', rand: 'random', rdm: 'random', ea: 'each', ech: 'each', xtra: 'extra', pwr: 'power', pw: 'power',
  bc: 'battlecry', dr: 'deathrattle', ds: 'divine shield', eot: 'end of turn', sot: 'start of turn',
  spd: 'spell damage', sd: 'spell damage', lst: 'lifesteal', disc: 'discover', disco: 'discover',
  gen: 'generate', dup: 'copy', cpy: 'copy', n: 'and',
};

/**
 * Split text into lowercase words and numbers, ignoring punctuation.
 * Number words become digits, so "two" and "2" are the same word, and
 * shorthand like "ur" or "dmg" becomes the full word.
 */
export function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .flatMap((w) => (ABBREVIATIONS[w] ?? w).split(' '))
    .map((w) => NUMBER_WORDS[w] ?? w);
}

/** Drop a plural/verb "s" so "whelp" and "whelps" match. */
const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/**
 * Two words match if equal (ignoring a trailing "s"), or close enough for a
 * typo: 1 letter off for words of 4+ letters, 2 letters for 8+. Numbers must
 * match exactly.
 */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  const x = stem(a);
  const y = stem(b);
  if (x === y) return true;
  const n = Math.min(x.length, y.length);
  if (n < 4) return false;
  return levenshtein(x, y) <= (n >= 8 ? 2 : 1);
}

/** Words that carry no meaning on a card; they don't count toward the score. */
export const FILLER = new Set([
  'a', 'an', 'the', 'to', 'of', 'and', 'your', 'you', 'it', 'its', 'this', 'that', 'with', 'in', 'on', 'for', 'is', 'are',
  'be', 'from', 'at', 'by', 'or', 'them', 'they', 'their', 'into',
]);

/**
 * Match each word of `truth` to an unused word of `guess`, in any order.
 * Returns which truth words were matched and how many guess words were used.
 */
export function matchWords(truth: string[], guess: string[]): { inTruth: boolean[]; usedGuess: boolean[] } {
  const usedGuess = guess.map(() => false);
  const inTruth = truth.map((t) => {
    // Prefer an exact match before a typo match.
    let j = guess.findIndex((g, k) => !usedGuess[k] && g === t);
    if (j < 0) j = guess.findIndex((g, k) => !usedGuess[k] && sameWord(t, g));
    if (j < 0) return false;
    usedGuess[j] = true;
    return true;
  });
  return { inTruth, usedGuess };
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
