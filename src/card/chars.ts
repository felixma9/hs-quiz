/**
 * Split a string into the characters a reader sees: each letter together with
 * any combining marks on it. Stands in for the `chars` package that Sunwell
 * uses (aliased in vite.config.ts): that one looks up each character's Unicode
 * category by rebuilding a list of every code point, which took about 70% of
 * the time to draw a card. Card names and text are plain enough for this.
 */
export default function chars(text: string): string[] {
  return String(text).match(/\P{M}\p{M}*|\p{M}+/gu) ?? [];
}
