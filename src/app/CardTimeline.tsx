import type { Card } from '../lib/types';
import { drawable } from '../pool/pool';
import { GameCard } from '../card/GameCard';
import { monthYear, wordDiff, type Version } from '../lib/history';

const NONE = new Set<never>();
const renderUrl = (c: Card) => `https://art.hearthstonejson.com/v1/render/latest/enUS/512x/${c.id}.png`;

/** Old text with the removed words struck out, new text with the added words marked. */
function TextChange({ from, to }: { from: string; to: string }) {
  const { removed, added } = wordDiff(from, to);
  // Runs of changed words are marked together, so a rewritten phrase reads as one change.
  const words = (ws: [string, boolean][], cls: string) => {
    if (!ws.length) return <em className="muted">No text</em>;
    const runs: [string, boolean][] = [];
    for (const [w, changed] of ws) {
      const last = runs.at(-1);
      if (last && last[1] === changed) last[0] += ` ${w}`;
      else runs.push([w, changed]);
    }
    return runs.map(([text, changed], i) => (
      <span key={i}>
        {i > 0 && ' '}
        {changed ? <span className={cls}>{text}</span> : text}
      </span>
    ));
  };
  return (
    <div className="tl-text">
      <p><span className="tl-label">Before</span> {words(removed, 'tl-del')}</p>
      <p><span className="tl-label">After</span> {words(added, 'tl-ins')}</p>
    </div>
  );
}

/**
 * Every version of a card, newest first, down a timeline: each one drawn as it
 * was, tagged with the patch and date it came in and what changed.
 */
export function CardTimeline({ versions }: { versions: Version[] }) {
  const canDraw = drawable([versions[0].card]).length > 0;
  return (
    <ol className="tl">
      {versions.map((v, i) => {
        const until = i > 0 ? versions[i - 1] : null;
        return (
          <li key={i} className={`tl-item ${i === 0 ? 'now' : ''}`} style={{ '--i': i } as React.CSSProperties}>
            <div className="tl-tags">
              <span className="tl-when">{v.patch ? `Patch ${v.patch}` : 'At release'}</span>
              {v.date && <span className="tl-date">{monthYear(v.date)}</span>}
              {i === 0 && <span className="tl-tag now">Current</span>}
              {v.tags.map((t) => (
                <span key={t.label} className={`tl-tag ${t.tone}`}>
                  {t.label}
                </span>
              ))}
            </div>
            <div className="tl-body">
              <div className="tl-card">
                {canDraw ? (
                  <GameCard card={v.card} hidden={NONE} pool={[]} />
                ) : i === 0 ? (
                  <img className="zoom-render" src={renderUrl(v.card)} alt={v.card.name} />
                ) : null}
              </div>
              <div className="tl-changes">
                {v.diffs.map((d) => (
                  <div key={d.key} className="tl-diff">
                    <span className="tl-label">{d.label}</span> <span className="tl-old">{d.from}</span> →{' '}
                    <b className={d.tone ?? ''}>{d.to}</b>
                  </div>
                ))}
                {v.oldText !== undefined && <TextChange from={v.oldText} to={v.card.text ?? ''} />}
                {!v.patch && (
                  <p className="muted small">
                    As the card first came out{until?.date ? `, until ${monthYear(until.date)}` : ''}.
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
