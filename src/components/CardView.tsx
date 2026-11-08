import { useEffect, useState } from 'react';
import type { Card } from '../lib/types';
import { ATTR, pretty, type AttrKey } from '../lib/attributes';
import { artUrl } from '../lib/cards';

interface Props {
  card: Card;
  /** Attributes to show as "?". */
  hidden: Set<AttrKey>;
  /** Attribute to highlight (the one being asked). */
  focus?: AttrKey | null;
}

export function CardView({ card, hidden, focus }: Props) {
  const [artFailed, setArtFailed] = useState(false);
  useEffect(() => setArtFailed(false), [card.id]);

  const show = (k: AttrKey) => !hidden.has(k);
  const val = (k: AttrKey) => ATTR[k].value(card);
  const cls = (k: AttrKey) => (focus === k ? 'focus' : '') + (show(k) ? '' : ' unknown');
  const q = (k: AttrKey, text: string) => (show(k) ? text : '?');

  const attack = val('attack');
  const health = val('health');
  const tribe = val('tribe');
  const classKey = show('class') ? String(val('class')).split(' + ')[0] : 'UNKNOWN';

  return (
    <div className={`card cls-${classKey}`}>
      <div className="card-art">
        {artFailed ? (
          <div className="art-missing">No art</div>
        ) : (
          <img src={artUrl(card)} alt="" onError={() => setArtFailed(true)} />
        )}
        <div className={`gem gem-cost ${cls('cost')}`}>{q('cost', String(card.cost))}</div>
        <div className={`rarity-dot r-${show('rarity') ? card.rarity : 'UNKNOWN'} ${cls('rarity')}`} title="Rarity" />
      </div>
      <div className={`card-name ${cls('name')}`}>{show('name') ? card.name : '? ? ?'}</div>
      <div className="card-meta">
        <span className={cls('class')}>{q('class', pretty('class', val('class')))}</span>
        <span className={cls('type')}>{q('type', pretty('type', card.type))}</span>
        <span className={cls('rarity')}>{q('rarity', pretty('rarity', card.rarity))}</span>
      </div>
      <div className={`card-text ${cls('text')}`}>
        {show('text') ? card.text || <em className="muted">No card text</em> : '? ? ?'}
      </div>
      <div className="card-foot">
        {(attack !== null || !show('attack')) && (
          <div className={`gem gem-atk ${cls('attack')}`}>{q('attack', String(attack ?? '—'))}</div>
        )}
        <div className="card-foot-mid">
          {(tribe !== 'NONE' || !show('tribe')) && (
            <div className={`tribe ${cls('tribe')}`}>{q('tribe', pretty('tribe', tribe))}</div>
          )}
          <div className={`card-set ${cls('set')}`}>{q('set', pretty('set', card.set))}</div>
        </div>
        {(health !== null || !show('health')) && (
          <div className={`gem gem-hp ${cls('health')}`}>{q('health', String(health ?? '—'))}</div>
        )}
      </div>
    </div>
  );
}
