import { words } from '../lib/fuzzy';

/** The real card text with the words the player got highlighted. */
export function TextDiff({ truth, matched }: { truth: string; matched?: boolean[] }) {
  if (!truth) return <em className="muted">This card has no text.</em>;
  if (!matched) return <span>{truth}</span>;
  // Walk the original text and map each word to its matched flag.
  const parts = truth.split(/(\s+)/);
  let wi = 0;
  return (
    <span className="text-diff">
      {parts.map((p, i) => {
        if (/^\s+$/.test(p)) return p;
        const n = words(p).length;
        const hit = n > 0 && matched.slice(wi, wi + n).every(Boolean);
        wi += n;
        return (
          <span key={i} className={hit ? 'hit' : 'miss'}>
            {p}
          </span>
        );
      })}
    </span>
  );
}
