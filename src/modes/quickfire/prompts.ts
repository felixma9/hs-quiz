import type { Card } from '../../lib/types';
import { pretty } from '../../lib/attributes';
import { levenshtein, normalizeName } from '../../lib/fuzzy';
import { nameTolerance } from '../../lib/grade';

/**
 * Quickfire prompts: "Name a minion with 4 Attack", "Name a Mage spell that
 * costs 2", "Finish the minion name: Chi…". Each prompt is built from a real
 * card in the pool, so it always has an answer.
 */
export interface Prompt {
  /** Prompt text; **double stars** mark the parts to bold. */
  text: string;
  /** Shown under the prompt (e.g. the card type for name prompts). */
  hint?: string;
  /** Does this card answer the prompt? */
  test(c: Card): boolean;
  /** Short reason a card that fails doesn't fit, e.g. "has 3 Attack". */
  why(c: Card): string;
  /** Every card in the pool that fits. */
  answers: Card[];
}

type Rng = () => number;
const pick = <T,>(xs: T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];

/** Keywords common enough to ask about. */
const KEYWORDS = [
  'Battlecry', 'Deathrattle', 'Taunt', 'Rush', 'Discover', 'Lifesteal', 'Divine Shield', 'Secret', 'Stealth', 'Overload',
  'Freeze', 'Choose One', 'Spell Damage', 'Combo', 'Reborn', 'Poisonous', 'Charge', 'Windfury',
];

const SPELL_KEYWORDS = ['Discover', 'Secret', 'Overload', 'Lifesteal', 'Freeze', 'Choose One', 'Combo'];

const TYPE_WORD: Record<string, string> = { MINION: 'minion', SPELL: 'spell', WEAPON: 'weapon', HERO: 'hero card', LOCATION: 'location' };
const cls = (c: Card) => pretty('class', c.cardClass);
const tribe = (r: string) => pretty('tribe', r);
const school = (s: string) => pretty('tribe', s);
/** "a" or "an", including for numbers (an 8/8, an 11/11). */
const art = (word: string) => (/^([aeiou]|8|1[18](\D|$))/i.test(word) ? 'an' : 'a');
const a = (word: string) => `${art(word)} ${word}`;

/** One-line description of a card, used to explain wrong answers. */
export function describe(c: Card): string {
  const stats = c.type === 'MINION' || c.type === 'WEAPON' ? ` ${c.attack ?? 0}/${c.health ?? 0}` : '';
  const tag = c.races?.length ? ` ${c.races.map(tribe).join('/')}` : c.spellSchool ? ` ${school(c.spellSchool)}` : '';
  const owner = c.cardClass === 'NEUTRAL' ? 'Neutral' : cls(c);
  return `a ${c.cost}-mana${stats} ${owner}${tag} ${TYPE_WORD[c.type] ?? 'card'}`;
}

interface Template {
  weight: number;
  /** Build a prompt around this card, or null if the card doesn't suit. */
  make(seed: Card, rng: Rng): Omit<Prompt, 'answers'> | null;
  /** How many answers the pool must have (name prompts need just one). */
  min?: number;
}

const has = (c: Card, k: string) => c.keywords?.includes(k) ?? false;
const isMinion = (c: Card) => c.type === 'MINION';

const TEMPLATES: Template[] = [
  {
    weight: 3,
    make: (s, rng) => {
      if (!isMinion(s)) return null;
      const stat = pick(['attack', 'health', 'cost'] as const, rng);
      const v = s[stat] ?? 0;
      const label = stat === 'cost' ? `that costs **${v}**` : `with **${v} ${stat === 'attack' ? 'Attack' : 'Health'}**`;
      return {
        text: `Name a **minion** ${label}`,
        test: (c) => isMinion(c) && (c[stat] ?? 0) === v,
        why: (c) =>
          !isMinion(c) ? `is ${a(TYPE_WORD[c.type])}` : stat === 'cost' ? `costs ${c.cost}` : `has ${c[stat] ?? 0} ${stat === 'attack' ? 'Attack' : 'Health'}`,
      };
    },
  },
  {
    weight: 2,
    make: (s) => {
      if (!isMinion(s)) return null;
      const [at, hp] = [s.attack ?? 0, s.health ?? 0];
      return {
        text: `Name ${art(`${at}/${hp}`)} **${at}/${hp}** minion`,
        test: (c) => isMinion(c) && (c.attack ?? 0) === at && (c.health ?? 0) === hp,
        why: (c) => (isMinion(c) ? `is ${c.attack ?? 0}/${c.health ?? 0}` : `is ${a(TYPE_WORD[c.type])}`),
      };
    },
  },
  {
    weight: 2,
    make: (s) => {
      if (s.cardClass === 'NEUTRAL' || s.classes?.length) return null;
      const t = TYPE_WORD[s.type];
      return {
        text: `Name a **${cls(s)} ${t}** that costs **${s.cost}**`,
        test: (c) => c.type === s.type && c.cardClass === s.cardClass && c.cost === s.cost,
        why: (c) => `is ${describe(c)}`,
      };
    },
  },
  {
    weight: 2,
    make: (s, rng) => {
      if (!isMinion(s) || !s.races?.length || s.races.includes('ALL')) return null;
      const r = pick(s.races, rng);
      const stat = pick(['attack', 'cost'] as const, rng);
      const v = s[stat] ?? 0;
      return {
        text: `Name ${art(tribe(r))} **${tribe(r)}** ${stat === 'cost' ? `that costs **${v}**` : `with **${v} Attack**`}`,
        test: (c) => isMinion(c) && (c.races?.includes(r) || c.races?.includes('ALL') || false) && (c[stat] ?? 0) === v,
        why: (c) => `is ${describe(c)}`,
      };
    },
  },
  {
    weight: 1.5,
    make: (s) => {
      if (s.type !== 'SPELL' || !s.spellSchool) return null;
      return {
        text: `Name ${art(school(s.spellSchool))} **${school(s.spellSchool)} spell** that costs **${s.cost}**`,
        test: (c) => c.type === 'SPELL' && c.spellSchool === s.spellSchool && c.cost === s.cost,
        why: (c) => `is ${describe(c)}`,
      };
    },
  },
  {
    weight: 1.5,
    make: (s) => {
      if (s.type !== 'SPELL') return null;
      return {
        text: `Name a **spell** that costs **${s.cost}**`,
        test: (c) => c.type === 'SPELL' && c.cost === s.cost,
        why: (c) => `is ${describe(c)}`,
      };
    },
  },
  {
    weight: 1,
    make: (s) => {
      if (s.type !== 'WEAPON') return null;
      return {
        text: `Name a **weapon** with **${s.attack ?? 0} Attack**`,
        test: (c) => c.type === 'WEAPON' && (c.attack ?? 0) === (s.attack ?? 0),
        why: (c) => `is ${describe(c)}`,
      };
    },
  },
  {
    weight: 2.5,
    make: (s, rng) => {
      // Spells often mention minion keywords they give ("gain Taunt"); only ask spells about their own.
      const allowed = s.type === 'SPELL' ? SPELL_KEYWORDS : KEYWORDS;
      const kws = (s.keywords ?? []).filter((k) => allowed.includes(k));
      if (!kws.length || (s.type !== 'MINION' && s.type !== 'SPELL')) return null;
      const k = pick(kws, rng);
      const t = TYPE_WORD[s.type];
      // Narrow by class or by cost, whichever the coin says.
      if (s.cardClass !== 'NEUTRAL' && !s.classes?.length && rng() < 0.5) {
        return {
          text: `Name a **${cls(s)} ${t}** with **${k}**`,
          test: (c) => c.type === s.type && c.cardClass === s.cardClass && has(c, k),
          why: (c) => (has(c, k) ? `is ${describe(c)}` : `doesn't have ${k}`),
        };
      }
      return {
        text: `Name a **${t}** with **${k}** that costs **${s.cost}**`,
        test: (c) => c.type === s.type && c.cost === s.cost && has(c, k),
        why: (c) => (has(c, k) ? `is ${describe(c)}` : `doesn't have ${k}`),
      };
    },
  },
  {
    weight: 1,
    make: (s) => {
      if (s.rarity !== 'LEGENDARY' || !isMinion(s) || s.cardClass === 'NEUTRAL') return null;
      return {
        text: `Name a **Legendary ${cls(s)} minion**`,
        test: (c) => isMinion(c) && c.rarity === 'LEGENDARY' && c.cardClass === s.cardClass,
        why: (c) => (c.rarity !== 'LEGENDARY' ? `isn't Legendary` : `is ${describe(c)}`),
      };
    },
  },
  {
    weight: 3,
    min: 1,
    // Only Legendaries: they're the names people actually remember.
    make: (s) => {
      if (s.rarity !== 'LEGENDARY') return null;
      const p = namePrefix(s.name);
      if (!p) return null;
      const n = normalizeName(p);
      return {
        text: `Finish the Legendary ${TYPE_WORD[s.type]}: **${p}…**`,
        hint: s.cardClass === 'NEUTRAL' ? 'Neutral' : cls(s),
        // Any card that starts this way counts.
        test: (c) => normalizeName(c.name).startsWith(n),
        why: () => `doesn't start with "${p}"`,
      };
    },
  },
];

/**
 * The start of a name to show: about a third of it, at least 3 letters, never
 * a whole word plus a space, never the whole name.
 */
export function namePrefix(name: string): string | null {
  const letters = name.replace(/[^A-Za-z]/g, '').length;
  if (letters < 6) return null;
  let n = Math.max(3, Math.round(name.length * 0.35));
  while (n < name.length && /[\s'’,-]/.test(name[n - 1])) n++;
  if (n >= name.length - 2) return null;
  return name.slice(0, n);
}

/** Make a prompt that has at least `min` answers in the pool (and not only used cards). */
export function makePrompt(pool: Card[], used: Set<string> = new Set(), rng: Rng = Math.random, minAnswers = 3): Prompt {
  const total = TEMPLATES.reduce((s, t) => s + t.weight, 0);
  for (let i = 0; i < 200; i++) {
    let r = rng() * total;
    const t = TEMPLATES.find((x) => (r -= x.weight) <= 0) ?? TEMPLATES[0];
    const seed = pick(pool, rng);
    if (used.has(seed.id)) continue;
    const p = t.make(seed, rng);
    if (!p) continue;
    const answers = pool.filter((c) => p.test(c));
    const open = answers.filter((c) => !used.has(c.id));
    // Late in the loop, accept fewer answers so tiny pools still work.
    if (open.length >= (t.min ?? (i < 150 ? minAnswers : 1))) return { ...p, answers };
  }
  // Fallback: finish any name.
  const open = pool.filter((c) => !used.has(c.id) && namePrefix(c.name));
  const seed = open.find((c) => c.rarity === 'LEGENDARY') ?? open[0] ?? pool[0];
  const p = namePrefix(seed.name) ?? seed.name.slice(0, 3);
  const n = normalizeName(p);
  return {
    text: `Finish the ${seed.rarity === 'LEGENDARY' ? 'Legendary ' : ''}${TYPE_WORD[seed.type]}: **${p}…**`,
    test: (c) => normalizeName(c.name).startsWith(n),
    why: () => `doesn't start with "${p}"`,
    answers: pool.filter((c) => normalizeName(c.name).startsWith(n)),
  };
}

/** Lowercase words of a name, accents and punctuation dropped ("Al'Akir" -> "alakir"). */
const nameWords = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * How well a typed word stands for a word of a card name: 2 = it's the word
 * or the start of it, 1 = close with a small typo, 0 = no.
 */
function wordFit(typed: string, word: string): number {
  if (word.startsWith(typed)) return typed.length >= 3 || typed === word ? 2 : 0;
  if (typed.length < 4) return 0;
  const head = word.slice(0, typed.length);
  const tol = typed.length >= 8 ? 2 : 1;
  return levenshtein(typed, head) <= tol || levenshtein(typed, word) <= (word.length >= 8 ? 2 : 1) ? 1 : 0;
}

/**
 * The card the player meant. Forgiving: exact names, small typos, and partial
 * names all work ("grommash" or "grom hells" find Grommash Hellscream). When a
 * partial name could mean several cards, `prefer` (e.g. "fits the prompt and
 * isn't used yet") picks between them. Searches every card, not just the pool.
 */
export function findCard(input: string, cards: Card[], prefer?: (c: Card) => boolean): Card | null {
  const g = normalizeName(input);
  if (g.length < 2) return null;
  // 1. The whole name, allowing a typo or two.
  let best: Card | null = null;
  let bestD = Infinity;
  for (const c of cards) {
    const n = normalizeName(c.name);
    if (n === g) return c;
    if (Math.abs(n.length - g.length) > 2) continue;
    const d = levenshtein(g, n);
    if (d <= nameTolerance(n.length) && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  if (best) return best;
  // 2. Part of the name: every typed word matches a word of the name, in order.
  const typed = nameWords(input);
  if (g.length < 4 || !typed.length) return null;
  const partial: { c: Card; fit: number }[] = [];
  for (const c of cards) {
    const words = nameWords(c.name);
    let i = 0;
    let fit = 2;
    let whole = false;
    for (const t of typed) {
      let f = 0;
      while (i < words.length && !(f = wordFit(t, words[i]))) i++;
      if (i >= words.length) {
        fit = 0;
        break;
      }
      const w = words[i++];
      if (t === w || (t.length >= 5 && w.length >= 5 && levenshtein(t, w) <= (w.length >= 8 ? 2 : 1))) whole = true;
      fit = Math.min(fit, f);
    }
    // Needs a complete word of the name, or most of it: just the first few
    // letters (e.g. the hint in "Finish the name: Ragn…") isn't an answer.
    const enough = whole || g.length >= normalizeName(c.name).length * 0.6;
    if (fit && enough) partial.push({ c, fit });
  }
  if (!partial.length) return null;
  // Prefer a card that answers the prompt, then real word matches over typos,
  // then the shortest (most likely) name.
  const ok = (c: Card) => Number(!!prefer?.(c));
  partial.sort((x, y) => ok(y.c) - ok(x.c) || y.fit - x.fit || x.c.name.length - y.c.name.length);
  return partial[0].c;
}
